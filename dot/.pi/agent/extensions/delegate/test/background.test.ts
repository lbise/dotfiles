import assert from "node:assert/strict";
import test from "node:test";

import { BackgroundTaskPool, type BackgroundTaskEvent } from "../background.ts";
import type { RunTaskRequest, TaskProgress, TaskResult } from "../runner.ts";

function progress(status: TaskProgress["status"] = "running"): TaskProgress {
  return {
    status,
    taskId: "task-123",
    agent: "explore",
    title: "Inspect code",
    activity: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const request = {
  agent: { name: "explore" },
  title: "Inspect code",
} as RunTaskRequest;

test("background tasks return after startup and report completion later", async () => {
  const completion = deferred<TaskResult>();
  const events: BackgroundTaskEvent[] = [];
  const pool = new BackgroundTaskPool({
    maxConcurrent: 2,
    runTask: async (_request, _onProgress, onStarted) => {
      onStarted?.(progress());
      return completion.promise;
    },
    onSettled: (event) => events.push(event),
  });

  assert.equal((await pool.start(request)).taskId, "task-123");
  assert.equal(pool.size, 1);
  assert.equal(pool.has("task-123"), true);
  assert.equal(pool.lookup("task-123")?.settled, false);
  assert.equal(events.length, 0);

  completion.resolve({ ...progress("completed"), output: "done" });
  await completion.promise;
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(pool.size, 0);
  assert.equal(events[0]?.result?.output, "done");
  assert.equal(pool.lookup("task-123")?.settled, true);
  assert.equal(pool.lookup("task-123")?.result?.output, "done");
});

test("background tasks are visible while child startup is pending", async () => {
  const startup = deferred<void>();
  const completion = deferred<TaskResult>();
  const pendingRequest = {
    agent: { name: "explore" },
    title: "Inspect code",
    shortcut: "ctrl+1",
  } as RunTaskRequest;
  const pool = new BackgroundTaskPool({
    maxConcurrent: 1,
    runTask: async (_request, _onProgress, onStarted) => {
      await startup.promise;
      onStarted?.(progress());
      return completion.promise;
    },
    onSettled: () => {},
  });

  const starting = pool.start(pendingRequest);
  assert.deepEqual(pool.list().map((task) => task.status), ["queued"]);
  startup.resolve();
  await starting;
  completion.resolve({ ...progress("completed"), output: "done" });
  await completion.promise;
});

test("background task changes notify the UI as progress changes", async () => {
  const completion = deferred<TaskResult>();
  let changes = 0;
  const pool = new BackgroundTaskPool({
    maxConcurrent: 1,
    runTask: async (_request, onProgress, onStarted) => {
      onStarted?.(progress());
      onProgress?.({ ...progress(), currentTool: "grep" });
      return completion.promise;
    },
    onSettled: () => {},
    onChange: () => { changes += 1; },
  });

  await pool.start(request);
  assert.ok(changes >= 3);
  const changesBeforeFinish = changes;
  completion.resolve({ ...progress("completed"), output: "done" });
  await completion.promise;
  await new Promise((resolve) => setImmediate(resolve));

  assert.ok(changes > changesBeforeFinish);
  assert.equal(pool.size, 0);
});

test("background task callbacks can be rebound after session replacement", async () => {
  const completion = deferred<TaskResult>();
  const initialEvents: BackgroundTaskEvent[] = [];
  const replacementEvents: BackgroundTaskEvent[] = [];
  const pool = new BackgroundTaskPool({
    maxConcurrent: 1,
    runTask: async (_request, _onProgress, onStarted) => {
      onStarted?.(progress());
      return completion.promise;
    },
    onSettled: (event) => initialEvents.push(event),
  });

  await pool.start(request);
  pool.setCallbacks({ onSettled: (event) => replacementEvents.push(event) });
  completion.resolve({ ...progress("completed"), output: "done" });
  await completion.promise;
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(initialEvents.length, 0);
  assert.equal(replacementEvents.length, 1);
});

test("settlements are replayed when callbacks rebind after session replacement", async () => {
  const completion = deferred<TaskResult>();
  const initialEvents: BackgroundTaskEvent[] = [];
  const replacementEvents: BackgroundTaskEvent[] = [];
  const pool = new BackgroundTaskPool({
    maxConcurrent: 1,
    runTask: async (_request, _onProgress, onStarted) => {
      onStarted?.(progress());
      return completion.promise;
    },
    onSettled: (event) => initialEvents.push(event),
  });

  await pool.start(request);
  pool.suspendCallbacks();
  completion.resolve({ ...progress("completed"), output: "done" });
  await completion.promise;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(initialEvents.length, 0);

  pool.setCallbacks({ onSettled: (event) => replacementEvents.push(event) });
  assert.equal(replacementEvents.length, 1);
  assert.equal(replacementEvents[0]?.result?.output, "done");
});

test("waitFor returns completion or current progress at timeout", async () => {
  const completion = deferred<TaskResult>();
  const pool = new BackgroundTaskPool({
    maxConcurrent: 1,
    runTask: async (_request, _onProgress, onStarted) => {
      onStarted?.(progress());
      return completion.promise;
    },
    onSettled: () => {},
  });

  await pool.start(request);
  assert.equal((await pool.waitFor("task-123", 1))?.settled, false);

  const waiting = pool.waitFor("task-123", 1_000);
  completion.resolve({ ...progress("completed"), output: "done" });
  const result = await waiting;
  assert.equal(result?.settled, true);
  assert.equal(result?.result?.output, "done");
});

test("resuming a task_id clears its retained result while the new run is active", async () => {
  const firstCompletion = deferred<TaskResult>();
  const resumedCompletion = deferred<TaskResult>();
  let runCount = 0;
  const pool = new BackgroundTaskPool({
    maxConcurrent: 1,
    runTask: async (_request, _onProgress, onStarted) => {
      onStarted?.(progress());
      runCount += 1;
      return runCount === 1 ? firstCompletion.promise : resumedCompletion.promise;
    },
    onSettled: () => {},
  });

  await pool.start(request);
  firstCompletion.resolve({ ...progress("completed"), output: "first" });
  await firstCompletion.promise;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(pool.lookup("task-123")?.result?.output, "first");

  await pool.start({ ...request, taskId: "task-123" });
  assert.equal(pool.lookup("task-123")?.settled, false);
  assert.equal((await pool.waitFor("task-123", 1))?.settled, false);

  resumedCompletion.resolve({ ...progress("completed"), output: "second" });
  await resumedCompletion.promise;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(pool.lookup("task-123")?.result?.output, "second");
});

test("background startup failures reject without leaking a slot", async () => {
  const pool = new BackgroundTaskPool({
    maxConcurrent: 1,
    runTask: async () => {
      throw new Error("No usable model");
    },
    onSettled: () => assert.fail("a task that never started must not deliver completion"),
  });

  await assert.rejects(() => pool.start(request), /No usable model/);
  assert.equal(pool.size, 0);
});

test("background tasks can be cancelled by task_id", async () => {
  const events: BackgroundTaskEvent[] = [];
  const pool = new BackgroundTaskPool({
    maxConcurrent: 1,
    runTask: (_request, _onProgress, onStarted) => new Promise((_resolve, reject) => {
      onStarted?.(progress());
      _request.signal?.addEventListener("abort", () => reject(new Error("Task aborted")), { once: true });
    }),
    onSettled: (event) => events.push(event),
  });

  await pool.start(request);
  assert.equal(pool.cancel("unknown"), false);
  assert.equal(pool.cancel("task-123"), true);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(pool.size, 0);
  assert.match(events[0]?.error?.message ?? "", /aborted/);
});

test("a resumed task_id is reserved during asynchronous startup", async () => {
  const startup = deferred<void>();
  const completion = deferred<TaskResult>();
  const resumedRequest = { ...request, taskId: "task-123" };
  const pool = new BackgroundTaskPool({
    maxConcurrent: 2,
    runTask: async (_request, _onProgress, onStarted) => {
      await startup.promise;
      onStarted?.(progress());
      return completion.promise;
    },
    onSettled: () => {},
  });

  const first = pool.start(resumedRequest);
  await assert.rejects(() => pool.start(resumedRequest), /already running/);
  startup.resolve();
  await first;
  completion.resolve({ ...progress("completed"), output: "done" });
  await completion.promise;
});

test("background task concurrency is bounded", async () => {
  const completion = deferred<TaskResult>();
  const pool = new BackgroundTaskPool({
    maxConcurrent: 1,
    runTask: async (_request, _onProgress, onStarted) => {
      onStarted?.(progress());
      return completion.promise;
    },
    onSettled: () => {},
  });

  await pool.start(request);
  await assert.rejects(() => pool.start(request), /Maximum: 1/);
  completion.resolve({ ...progress("completed"), output: "done" });
  await completion.promise;
});

test("shutdown rejects callers waiting for startup", async () => {
  const pool = new BackgroundTaskPool({
    maxConcurrent: 1,
    shutdownTimeoutMs: 5,
    runTask: () => new Promise(() => {}),
    onSettled: () => assert.fail("a task that never started must not deliver completion"),
  });

  const starting = pool.start(request);
  const rejected = assert.rejects(starting, /stopped during startup/);
  await pool.shutdown();
  await rejected;
});

test("shutdown has a deadline when a child does not settle", async () => {
  const pool = new BackgroundTaskPool({
    maxConcurrent: 1,
    shutdownTimeoutMs: 5,
    runTask: (_request, _onProgress, onStarted) => new Promise(() => {
      onStarted?.(progress());
    }),
    onSettled: () => assert.fail("shutdown must suppress completion"),
  });

  await pool.start(request);
  await pool.shutdown();
  assert.equal(pool.size, 0);
});

test("shutdown aborts tasks without delivering completion", async () => {
  const events: BackgroundTaskEvent[] = [];
  const pool = new BackgroundTaskPool({
    maxConcurrent: 1,
    runTask: (_request, _onProgress, onStarted) => new Promise((_resolve, reject) => {
      onStarted?.(progress());
      _request.signal?.addEventListener("abort", () => reject(new Error("Task aborted")), { once: true });
    }),
    onSettled: (event) => events.push(event),
  });

  await pool.start(request);
  await pool.shutdown();

  assert.equal(pool.size, 0);
  assert.equal(events.length, 0);
  await assert.rejects(() => pool.start(request), /shutting down/);
});
