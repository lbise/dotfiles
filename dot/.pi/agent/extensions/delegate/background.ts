import type { RunTaskRequest, TaskProgress, TaskResult } from "./runner.ts";

export type BackgroundTaskEvent = {
  progress: TaskProgress;
  result?: TaskResult;
  error?: Error;
};

export type BackgroundTaskSnapshot = BackgroundTaskEvent & {
  settled: boolean;
};

type TaskRunner = (
  request: RunTaskRequest,
  onProgress?: (progress: TaskProgress) => void,
  onStarted?: (progress: TaskProgress) => void,
) => Promise<TaskResult>;

type BackgroundTaskPoolOptions = {
  maxConcurrent: number;
  shutdownTimeoutMs?: number;
  runTask: TaskRunner;
  onSettled: (event: BackgroundTaskEvent) => void;
  onChange?: () => void;
};

type ActiveRun = {
  controller: AbortController;
  completion?: Promise<TaskResult>;
  progress?: TaskProgress;
  taskId?: string;
  started: boolean;
  closed: boolean;
  settled: Promise<BackgroundTaskEvent>;
  resolveStarted: (progress: TaskProgress) => void;
  rejectStarted: (error: Error) => void;
  resolveSettled: (event: BackgroundTaskEvent) => void;
};

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export class BackgroundTaskPool {
  readonly #options: BackgroundTaskPoolOptions;
  #onSettled?: (event: BackgroundTaskEvent) => void;
  #onChange?: () => void;
  #runTask: TaskRunner;
  readonly #undelivered: BackgroundTaskEvent[] = [];
  readonly #runs = new Set<ActiveRun>();
  readonly #byTaskId = new Map<string, ActiveRun>();
  readonly #settled = new Map<string, BackgroundTaskEvent>();
  #shuttingDown = false;

  constructor(options: BackgroundTaskPoolOptions) {
    this.#options = options;
    this.#onSettled = options.onSettled;
    this.#onChange = options.onChange;
    this.#runTask = options.runTask;
  }

  setCallbacks(callbacks: Pick<BackgroundTaskPoolOptions, "onSettled" | "onChange"> & { runTask?: TaskRunner }): void {
    this.#onSettled = callbacks.onSettled;
    this.#onChange = callbacks.onChange;
    if (callbacks.runTask) this.#runTask = callbacks.runTask;
    for (const event of this.#undelivered.splice(0)) this.#deliver(event);
  }

  suspendCallbacks(): void {
    this.#onSettled = undefined;
    this.#onChange = undefined;
  }

  get size(): number {
    return this.#runs.size;
  }

  has(taskId: string): boolean {
    return this.#byTaskId.has(taskId);
  }

  list(): TaskProgress[] {
    return [...this.#runs].flatMap((run) => run.progress ? [{ ...run.progress, activity: [...run.progress.activity] }] : []);
  }

  lookup(taskId: string): BackgroundTaskSnapshot | undefined {
    const settled = this.#settled.get(taskId);
    if (settled) return { ...settled, progress: this.#copyProgress(settled.progress), settled: true };
    const active = this.#byTaskId.get(taskId);
    if (!active?.progress) return undefined;
    return { progress: this.#copyProgress(active.progress), settled: false };
  }

  async waitFor(taskId: string, timeoutMs: number, signal?: AbortSignal): Promise<BackgroundTaskSnapshot | undefined> {
    const current = this.lookup(taskId);
    if (!current || current.settled) return current;
    const run = this.#byTaskId.get(taskId);
    if (!run) return this.lookup(taskId);

    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: (() => void) | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    });
    const aborted = new Promise<never>((_resolve, reject) => {
      abort = () => reject(new Error("Waiting for background task result was aborted"));
      if (signal?.aborted) abort();
      else signal?.addEventListener("abort", abort, { once: true });
    });
    try {
      await Promise.race([run.settled, timeout, aborted]);
      return this.lookup(taskId);
    } finally {
      if (timer) clearTimeout(timer);
      if (abort) signal?.removeEventListener("abort", abort);
    }
  }

  async start(request: RunTaskRequest, startupSignal?: AbortSignal): Promise<TaskProgress> {
    if (this.#shuttingDown) throw new Error("Background delegation is shutting down");
    if (this.#runs.size >= this.#options.maxConcurrent) {
      throw new Error(`Too many background tasks. Maximum: ${this.#options.maxConcurrent}`);
    }
    if (request.taskId && this.#byTaskId.has(request.taskId)) {
      throw new Error(`task_id is already running: ${request.taskId}`);
    }
    if (request.taskId) this.#settled.delete(request.taskId);

    let resolveStarted!: (progress: TaskProgress) => void;
    let rejectStarted!: (error: Error) => void;
    let resolveSettled!: (event: BackgroundTaskEvent) => void;
    const started = new Promise<TaskProgress>((resolve, reject) => {
      resolveStarted = resolve;
      rejectStarted = reject;
    });
    const settled = new Promise<BackgroundTaskEvent>((resolve) => {
      resolveSettled = resolve;
    });
    const run: ActiveRun = {
      controller: new AbortController(),
      progress: {
        status: "queued",
        taskId: request.taskId ?? "",
        agent: request.agent.name,
        title: request.title,
        shortcut: request.shortcut,
        activity: [],
      },
      started: false,
      closed: false,
      settled,
      resolveStarted,
      rejectStarted,
      resolveSettled,
    };
    this.#runs.add(run);
    this.#notifyChanged();
    if (request.taskId) {
      run.taskId = request.taskId;
      this.#byTaskId.set(request.taskId, run);
    }

    const abortStartup = () => run.controller.abort();
    if (startupSignal?.aborted) abortStartup();
    else startupSignal?.addEventListener("abort", abortStartup, { once: true });

    const onProgress = (progress: TaskProgress) => {
      if (run.closed) return;
      run.progress = { ...progress, activity: [...progress.activity] };
      this.#notifyChanged();
    };
    const onStarted = (progress: TaskProgress) => {
      if (run.started || run.closed || this.#shuttingDown) return;
      run.started = true;
      run.taskId = progress.taskId;
      run.progress = { ...progress, activity: [...progress.activity] };
      this.#byTaskId.set(progress.taskId, run);
      this.#notifyChanged();
      run.resolveStarted(run.progress);
    };

    try {
      run.completion = this.#runTask(
        { ...request, signal: run.controller.signal },
        onProgress,
        onStarted,
      );
      void run.completion.then(
        (result) => this.#finish(run, { progress: result, result }),
        (error) => this.#finish(run, { progress: run.progress, error: asError(error) }),
      );
      return await started;
    } finally {
      startupSignal?.removeEventListener("abort", abortStartup);
    }
  }

  cancel(taskId: string): boolean {
    const run = this.#byTaskId.get(taskId);
    if (!run) return false;
    run.controller.abort();
    return true;
  }

  async shutdown(): Promise<void> {
    this.#shuttingDown = true;
    const runs = [...this.#runs];
    for (const run of runs) {
      run.controller.abort();
      if (!run.started) run.rejectStarted(new Error("Background delegation stopped during startup"));
    }

    const completions = runs.flatMap((run) => run.completion ? [run.completion] : []);
    const settled = Promise.allSettled(completions);
    const timeoutMs = this.#options.shutdownTimeoutMs ?? 5_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      settled,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
    if (timer) clearTimeout(timer);
    for (const run of runs) run.closed = true;
    this.#runs.clear();
    this.#byTaskId.clear();
    this.#undelivered.length = 0;
    this.#notifyChanged();
  }

  #copyProgress(progress: TaskProgress): TaskProgress {
    return { ...progress, activity: [...progress.activity] };
  }

  #notifyChanged(): void {
    try {
      this.#onChange?.();
    } catch {
      // UI refreshes must not affect task execution.
    }
  }

  #remember(event: BackgroundTaskEvent): void {
    this.#settled.delete(event.progress.taskId);
    this.#settled.set(event.progress.taskId, event);
    if (this.#settled.size > 100) {
      const oldest = this.#settled.keys().next().value;
      if (oldest) this.#settled.delete(oldest);
    }
  }

  #finish(run: ActiveRun, event: { progress?: TaskProgress; result?: TaskResult; error?: Error }): void {
    if (run.closed) return;
    run.closed = true;
    this.#runs.delete(run);
    if (run.taskId) this.#byTaskId.delete(run.taskId);
    this.#notifyChanged();

    if (!run.started) {
      run.rejectStarted(event.error ?? new Error("Background task finished before reporting its task_id"));
      return;
    }
    if (!event.progress) return;

    const settledEvent: BackgroundTaskEvent = {
      progress: this.#copyProgress(event.progress),
      result: event.result,
      error: event.error,
    };
    this.#remember(settledEvent);
    run.resolveSettled(settledEvent);
    if (this.#shuttingDown) return;
    if (!this.#onSettled) {
      this.#undelivered.push(settledEvent);
      return;
    }
    this.#deliver(settledEvent);
  }

  #deliver(event: BackgroundTaskEvent): void {
    try {
      this.#onSettled?.(event);
    } catch {
      // Completion delivery must not affect task execution.
    }
  }
}
