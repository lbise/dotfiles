import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import {
  Markdown,
  type Component,
  type Focusable,
  type KeyId,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";

import type { TaskProgress } from "./runner.ts";

type Theme = ExtensionContext["ui"]["theme"];
type RenderResult = {
  content: Array<{ type: string; text?: string }>;
  details?: unknown;
};
type RenderOptions = { expanded: boolean; isPartial: boolean };
type HeaderColor = "accent" | "success" | "warning" | "error";
type DelegateResultDetails = Partial<TaskProgress> & { output?: string; background?: boolean; error?: string };
type DelegateCompletionMessage = {
  content: string | Array<{ type: string; text?: string }>;
  details?: unknown;
};
type DelegateRenderState = { row?: DelegateToolRow };

type RoundedBoxOptions = {
  title: string;
  titleColor: HeaderColor;
  lines: string[];
};

class RoundedBox implements Component {
  constructor(
    private readonly options: RoundedBoxOptions,
    private readonly theme: Theme,
  ) {}

  render(width: number): string[] {
    if (width < 8) return this.options.lines.flatMap((line) => wrapTextWithAnsi(line, Math.max(1, width)));

    const interiorWidth = width - 2;
    const contentWidth = interiorWidth - 2;
    const title = truncateToWidth(this.options.title, Math.max(1, interiorWidth - 3), "");
    const titleWidth = visibleWidth(title);
    const top =
      this.theme.fg("borderAccent", "╭─ ") +
      this.theme.fg(this.options.titleColor, title) +
      this.theme.fg("borderAccent", ` ${"─".repeat(Math.max(0, interiorWidth - titleWidth - 3))}╮`);
    const bottom = this.theme.fg("borderAccent", `╰${"─".repeat(interiorWidth)}╯`);
    const body = this.options.lines.flatMap((line) => wrapTextWithAnsi(line, contentWidth)).map((line) => {
      const fitted = truncateToWidth(line, contentWidth);
      const padding = " ".repeat(Math.max(0, contentWidth - visibleWidth(fitted)));
      return this.theme.fg("borderAccent", "│") + ` ${fitted}${padding} ` + this.theme.fg("borderAccent", "│");
    });
    return [top, ...body, bottom];
  }

  invalidate(): void {}
}

function agentIcon(agent: string): string {
  if (agent === "explore") return "󰉋";
  if (agent === "general") return "󰚩";
  return "󰆍";
}

function statusIcon(status: string): string {
  if (status === "completed") return "󰄬";
  if (status === "failed") return "󰅖";
  if (status === "aborted") return "󰜺";
  if (status === "queued") return "󰔛";
  return "󰑮";
}

function statusColor(status: string): HeaderColor {
  if (status === "completed") return "success";
  if (status === "failed" || status === "aborted") return "error";
  return "warning";
}

function activityIcon(activity: string): string {
  if (activity.startsWith("failed")) return "󰅖";
  if (activity.startsWith("finished")) return "󰄬";
  return "󰑮";
}

function usageText(details: DelegateResultDetails): string | undefined {
  const usage = [
    details.turns ? `${details.turns} turn${details.turns === 1 ? "" : "s"}` : undefined,
    details.tokens ? `${details.tokens} tokens` : undefined,
    details.cost ? `$${details.cost.toFixed(4)}` : undefined,
  ].filter(Boolean).join(" · ");
  return usage || undefined;
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

class BackgroundDelegateRenderState {
  readonly #latest = new Map<string, { progress: TaskProgress; error?: string }>();
  readonly #rows = new Map<string, Set<DelegateToolRow>>();

  attach(row: DelegateToolRow, taskId: string): void {
    const latest = this.#latest.get(taskId);
    if (latest) {
      row.updateBackground(latest.progress, latest.error, false);
      if (latest.progress.status !== "queued" && latest.progress.status !== "running") return;
    }
    const rows = this.#rows.get(taskId) ?? new Set<DelegateToolRow>();
    rows.add(row);
    this.#rows.set(taskId, rows);
  }

  detach(row: DelegateToolRow, taskId: string | undefined): void {
    if (!taskId) return;
    const rows = this.#rows.get(taskId);
    rows?.delete(row);
    if (rows?.size === 0) this.#rows.delete(taskId);
  }

  update(progress: TaskProgress, error?: Error): void {
    const normalized = error && (progress.status === "queued" || progress.status === "running")
      ? { ...progress, status: "failed" as const, error: error.message, activity: [...progress.activity] }
      : { ...progress, activity: [...progress.activity] };
    const update = { progress: normalized, error: error?.message };
    this.#latest.delete(normalized.taskId);
    this.#latest.set(normalized.taskId, update);
    if (this.#latest.size > 100) {
      const oldest = this.#latest.keys().next().value;
      if (oldest) this.#latest.delete(oldest);
    }
    for (const row of this.#rows.get(normalized.taskId) ?? []) {
      row.updateBackground(normalized, error?.message, true);
    }
    if (normalized.status !== "queued" && normalized.status !== "running") {
      this.#rows.delete(normalized.taskId);
    }
  }
}

function toolAction(tool: string): string {
  switch (tool) {
    case "read": return "reading";
    case "grep": return "searching";
    case "find": return "finding files";
    case "ls": return "listing files";
    case "bash": return "running a command";
    case "edit": return "editing";
    case "write": return "writing";
    default: return `using ${tool}`;
  }
}

export function renderDelegateCompletion(
  message: DelegateCompletionMessage,
  options: { expanded: boolean; outputPad: number },
  theme: Theme,
): Component {
  const details = message.details as DelegateResultDetails | undefined;
  const status = details?.status ?? "completed";
  const agent = details?.agent ?? "delegate";
  const title = details?.title ?? "Background task";
  const content = typeof message.content === "string"
    ? message.content
    : message.content.filter((part) => part.type === "text" && typeof part.text === "string").map((part) => part.text).join("\n");
  const output = details?.output || content.replace(/^<task[^>]*>\n?/, "").replace(/\n?<\/task>\s*$/, "");
  const outputLines = output ? new Markdown(output, 0, 0, getMarkdownTheme()).render(96) : ["(no output)"];
  const visibleOutput = options.expanded ? outputLines : outputLines.slice(0, 6);
  const lines = [
    theme.fg("dim", `${agentIcon(agent)} ${agent} · ${title}`),
    theme.fg(statusColor(status), `${statusIcon(status)} ${status}`),
    "",
    ...visibleOutput,
  ];
  if (!options.expanded && outputLines.length > visibleOutput.length) {
    lines.push(theme.fg("muted", "… expand to see the full result"));
  }
  if (details?.error) lines.push("", theme.fg("error", details.error));

  return new RoundedBox({
    title: "󰆍 delegate completed",
    titleColor: status === "completed" ? "success" : "error",
    lines,
  }, theme);
}

export function renderBackgroundTasks(tasks: readonly TaskProgress[], theme: Theme, spinnerFrame = 0): string[] {
  if (tasks.length === 0) return [];

  const count = `${tasks.length} background delegate${tasks.length === 1 ? "" : "s"} running`;
  return [
    theme.fg("accent", `󰆍 ${count}`),
    ...tasks.map((task, index) => {
      const action = task.currentTool
        ? toolAction(task.currentTool)
        : task.status === "queued" ? "starting" : "thinking";
      const label = `${agentIcon(task.agent)} ${task.agent} · ${task.title}`;
      const spinner = SPINNER_FRAMES[(spinnerFrame + index * 2) % SPINNER_FRAMES.length];
      return `  ${theme.fg("warning", spinner)} ${label} ${theme.fg("dim", `· ${action}`)}`;
    }),
  ];
}

export class BackgroundTasksWidget implements Component {
  #spinnerFrame = 0;
  readonly #spinnerTimer: ReturnType<typeof setInterval>;

  constructor(
    private readonly tasks: readonly TaskProgress[],
    private readonly theme: Theme,
    requestRender: () => void,
  ) {
    this.#spinnerTimer = setInterval(() => {
      this.#spinnerFrame = (this.#spinnerFrame + 1) % SPINNER_FRAMES.length;
      requestRender();
    }, 120);
  }

  render(width: number): string[] {
    return renderBackgroundTasks(this.tasks, this.theme, this.#spinnerFrame)
      .map((line) => truncateToWidth(line, Math.max(1, width)));
  }

  invalidate(): void {}

  dispose(): void {
    clearInterval(this.#spinnerTimer);
  }
}

type BackgroundTaskDetail = {
  progress: TaskProgress;
  settled: boolean;
  error?: Error;
};

export class BackgroundTaskDetailOverlay implements Focusable {
  focused = false;

  constructor(
    private readonly shortcut: string,
    private readonly theme: Theme,
    private readonly task: () => BackgroundTaskDetail | undefined,
    private readonly done: (result: void) => void,
    private readonly onDispose: () => void,
  ) {}

  handleInput(data: string): void {
    if (
      matchesKey(data, "escape") ||
      matchesKey(data, "return") ||
      matchesKey(data, this.shortcut as KeyId)
    ) this.done();
  }

  render(width: number): string[] {
    const snapshot = this.task();
    if (!snapshot) return [this.theme.fg("warning", "Task details are no longer available.")];
    const task = snapshot.progress;
    const status = snapshot.settled ? task.status : task.currentTool ? toolAction(task.currentTool) : "thinking";
    const lines = [
      this.theme.fg("accent", `${agentIcon(task.agent)} ${task.agent} · ${task.title}`),
      this.theme.fg(statusColor(task.status), `${statusIcon(task.status)} ${status}`),
      "",
      ...task.activity.slice(-8).map((activity) => this.theme.fg("muted", `${activityIcon(activity)} ${activity}`)),
    ];
    if (task.outputPreview) lines.push("", ...wrapTextWithAnsi(task.outputPreview, Math.max(1, width - 4)).slice(-6));
    if (snapshot.error) lines.push("", this.theme.fg("error", snapshot.error.message));
    lines.push("", this.theme.fg("dim", `${task.taskId} · Esc / ${this.shortcut} to close`));
    return lines.flatMap((line) => wrapTextWithAnsi(line, Math.max(1, width)));
  }

  invalidate(): void {}

  dispose(): void {
    this.onDispose();
  }
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1_000) return `${Math.max(0, milliseconds)}ms`;
  if (milliseconds < 60_000) return `${(milliseconds / 1_000).toFixed(1)}s`;
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1_000);
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function delegateBoxWidth(availableWidth: number, title: string, lines: string[]): number {
  const widest = Math.max(visibleWidth(title), ...lines.map(visibleWidth), 0);
  const preferred = Math.max(40, widest + 4);
  return Math.min(availableWidth, 96, preferred);
}

class DelegateToolRow implements Component {
  #args: Record<string, unknown>;
  #theme: Theme;
  #executionStarted = false;
  #spinnerFrame = 0;
  #startedAt = Date.now();
  #finishedAt?: number;
  #spinnerTimer?: ReturnType<typeof setInterval>;
  #invalidate?: () => void;
  #result?: { result: RenderResult; options: RenderOptions; isError: boolean };
  #backgroundTaskId?: string;

  constructor(
    args: Record<string, unknown>,
    theme: Theme,
    private readonly backgroundTasks: BackgroundDelegateRenderState,
  ) {
    this.#args = args;
    this.#theme = theme;
  }

  updateCall(args: Record<string, unknown>, theme: Theme, executionStarted: boolean): void {
    this.#args = args;
    this.#theme = theme;
    this.#executionStarted = executionStarted;
  }

  startSpinner(invalidate: () => void): void {
    if (!this.#isRunning()) return;
    this.#invalidate = invalidate;
    if (this.#spinnerTimer) return;
    this.#spinnerTimer = setInterval(() => {
      if (!this.#isRunning()) {
        this.stopSpinner();
        return;
      }
      this.#spinnerFrame = (this.#spinnerFrame + 1) % SPINNER_FRAMES.length;
      this.#invalidate?.();
    }, 120);
  }

  stopSpinner(): void {
    if (this.#spinnerTimer) clearInterval(this.#spinnerTimer);
    this.#spinnerTimer = undefined;
    this.#invalidate = undefined;
  }

  updateResult(
    result: RenderResult,
    options: RenderOptions,
    theme: Theme,
    isError: boolean,
    invalidate: () => void,
  ): void {
    this.#result = { result, options, isError };
    this.#theme = theme;
    const details = result.details as DelegateResultDetails | undefined;
    const taskId = details?.background && details.taskId ? details.taskId : undefined;
    if (this.#backgroundTaskId !== taskId) {
      this.backgroundTasks.detach(this, this.#backgroundTaskId);
      this.#backgroundTaskId = taskId;
    }
    if (taskId) this.backgroundTasks.attach(this, taskId);
    if (this.#isRunning()) {
      this.startSpinner(invalidate);
    } else {
      this.#finishedAt ??= Date.now();
      this.stopSpinner();
    }
  }

  updateBackground(progress: TaskProgress, error?: string, notify = true): void {
    if (!this.#result) return;
    this.#result = {
      ...this.#result,
      isError: this.#result.isError || progress.status === "failed",
      result: {
        ...this.#result.result,
        details: {
          ...(this.#result.result.details as DelegateResultDetails | undefined),
          ...progress,
          background: true,
          currentTool: progress.status === "queued" || progress.status === "running" ? progress.currentTool : undefined,
          error: error ?? progress.error,
        },
      },
    };
    if (this.#isRunning()) {
      if (notify) this.#invalidate?.();
      return;
    }
    const invalidate = this.#invalidate;
    this.#finishedAt ??= Date.now();
    this.stopSpinner();
    invalidate?.();
  }

  #isRunning(): boolean {
    if (this.#result?.isError) return false;
    const details = this.#result?.result.details as DelegateResultDetails | undefined;
    const status = details?.status;
    if (status) return status === "queued" || status === "running";
    return this.#result ? this.#result.options.isPartial : this.#executionStarted;
  }

  render(width: number): string[] {
    const agent = typeof this.#args.subagent_type === "string" ? this.#args.subagent_type : "delegate";
    const mode = this.#args.mode === "background" ? "background" : "foreground";
    const title = typeof this.#args.title === "string" ? this.#args.title : "...";
    const details = this.#result?.result.details as DelegateResultDetails | undefined;
    const status = details?.status ?? (
      this.#result?.isError ? "failed" :
      this.#result ? (this.#result.options.isPartial ? "running" : "completed") :
      this.#executionStarted ? "running" : "queued"
    );
    const output = details?.output || (this.#result?.isError ? this.#result.result.content
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n") : undefined);
    const expanded = this.#result?.options.expanded ?? false;
    const lines = [this.#theme.fg("dim", `${agentIcon(agent)} ${details?.title ?? title}`)];
    const action = details?.currentTool
      ? `${SPINNER_FRAMES[this.#spinnerFrame]} ${toolAction(details.currentTool)}`
      : status === "running" || status === "queued"
        ? `${SPINNER_FRAMES[this.#spinnerFrame]} thinking`
        : `${statusIcon(status)} ${status}`;
    lines.push(this.#theme.fg(statusColor(status), action));

    if (expanded) {
      if (details?.activity?.length) {
        lines.push("");
        lines.push(...details.activity.map((activity) => this.#theme.fg("muted", `${activityIcon(activity)} ${activity}`)));
      }
      if (output) {
        lines.push("");
        lines.push(...new Markdown(output, 0, 0, getMarkdownTheme()).render(1_000));
      }
    }

    const usage = usageText(details ?? {});
    const modelDetails = [
      details?.model ? `󰘦 ${details.model}` : undefined,
      details?.thinking ? `󰊌 ${details.thinking}` : undefined,
    ].filter(Boolean).join(" · ");
    const duration = formatDuration((this.#finishedAt ?? Date.now()) - this.#startedAt);
    const usageDetails = [`󰥔 ${duration}`, usage ? `󰍛 ${usage}` : undefined].filter(Boolean).join(" · ");
    lines.push("");
    if (modelDetails) lines.push(this.#theme.fg("dim", modelDetails));
    lines.push(this.#theme.fg("dim", usageDetails));
    if (details?.taskId) lines.push(this.#theme.fg("dim", `󰆧 ${details.taskId}`));

    const shortcut = details?.shortcut ? ` · ${details.shortcut}` : "";
    const boxTitle = `󰆍 delegate · ${agent} · ${mode}${shortcut}`;
    return new RoundedBox({
      title: boxTitle,
      titleColor: "accent",
      lines,
    }, this.#theme).render(delegateBoxWidth(width, boxTitle, lines));
  }

  invalidate(): void {}

  dispose(): void {
    this.backgroundTasks.detach(this, this.#backgroundTaskId);
    this.stopSpinner();
  }
}

class EmptyComponent implements Component {
  render(): string[] {
    return [];
  }

  invalidate(): void {}
}

function state(value: unknown): DelegateRenderState {
  return value as DelegateRenderState;
}

export function createDelegateRenderer() {
  const backgroundTasks = new BackgroundDelegateRenderState();

  return {
    renderCall(args: Record<string, unknown>, theme: Theme, context: {
      state: unknown;
      executionStarted: boolean;
      invalidate: () => void;
    }): Component {
      const rendererState = state(context.state);
      const row = rendererState.row ??= new DelegateToolRow(args, theme, backgroundTasks);
      row.updateCall(args, theme, context.executionStarted);
      row.startSpinner(context.invalidate);
      return row;
    },

    renderResult(
      result: RenderResult,
      options: RenderOptions,
      theme: Theme,
      context: { args: Record<string, unknown>; state: unknown; isError: boolean; invalidate: () => void },
    ): Component {
      const rendererState = state(context.state);
      const row = rendererState.row ??= new DelegateToolRow(context.args, theme, backgroundTasks);
      row.updateResult(result, options, theme, context.isError, context.invalidate);
      return new EmptyComponent();
    },

    updateBackgroundTask(progress: TaskProgress, error?: Error): void {
      backgroundTasks.update(progress, error);
    },
  };
}
