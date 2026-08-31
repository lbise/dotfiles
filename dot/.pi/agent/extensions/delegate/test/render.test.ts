import assert from "node:assert/strict";
import test from "node:test";

import { BackgroundTaskPool } from "../background.ts";
import {
  BackgroundTasksWidget,
  createDelegateRenderer,
  createDelegateResultRenderer,
  renderBackgroundTasks,
  renderDelegateCompletion,
} from "../render.ts";
import type { RunTaskRequest, TaskProgress, TaskResult } from "../runner.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function progress(overrides: Partial<TaskProgress> = {}): TaskProgress {
  return {
    status: "running",
    taskId: "task-123",
    agent: "explore",
    title: "Inspect code",
    activity: [],
    ...overrides,
  };
}

const theme = {
  fg: (_color: string, value: string) => value,
  bold: (value: string) => value,
} as any;

const request = {
  agent: { name: "explore" },
  title: "Inspect code",
} as RunTaskRequest;

function renderRow(renderer: ReturnType<typeof createDelegateRenderer>, state: object, initial: TaskProgress) {
  let invalidations = 0;
  const invalidate = () => { invalidations += 1; };
  const row = renderer.renderCall(
    { title: initial.title, subagent_type: initial.agent, mode: "background" },
    theme,
    { state, executionStarted: true, invalidate },
  );
  renderer.renderResult(
    { content: [{ type: "text", text: "Background task started" }], details: { ...initial, background: true } },
    { expanded: false, isPartial: false },
    theme,
    {
      args: { title: initial.title, subagent_type: initial.agent, mode: "background" },
      state,
      isError: false,
      invalidate,
    },
  );
  return {
    row,
    invalidations: () => invalidations,
    dispose: () => (row as { dispose?(): void }).dispose?.(),
  };
}

test("delegate_result renders a compact result without exposing the task envelope", () => {
  const renderer = createDelegateResultRenderer();
  const rendererState = {};
  const args = { task_id: "task-123", mode: "wait" };
  const row = renderer.renderCall(args, theme, {
    state: rendererState,
    executionStarted: true,
    invalidate: () => {},
  });
  renderer.renderResult(
    {
      content: [{
        type: "text",
        text: '<task id="task-123" state="completed" background="true">\ndone\n</task>',
      }],
      details: {
        status: "completed",
        taskId: "task-123",
        agent: "explore",
        title: "Inspect code",
        settled: true,
      },
    },
    { expanded: false, isPartial: false },
    theme,
    {
      args,
      state: rendererState,
      isError: false,
      invalidate: () => {},
    },
  );

  const lines = row.render(120);
  const text = lines.join("\n");
  assert.doesNotMatch(text, /<\/?task/);
  assert.match(text, /done/);
  assert.match(text, /completed/);
  assert.ok(lines[0].length < 120, "short delegate_result content should not produce a full-width border");
});

test("a completed delegate message fits its border to short content", () => {
  const component = renderDelegateCompletion(
    {
      content: '<task id="task-123" state="completed" background="true">\ndone\n</task>',
      details: {
        status: "completed",
        taskId: "task-123",
        agent: "explore",
        title: "Inspect code",
        output: "done",
      },
    },
    { expanded: false, outputPad: 0 },
    theme,
  );

  const lines = component.render(120);
  assert.ok(lines[0].length < 120, "short completion content should not produce a full-width border");
});

test("a finalized background delegate row keeps animating while its task runs", async () => {
  const renderer = createDelegateRenderer();
  const rendered = renderRow(renderer, {}, progress());
  try {
    const before = rendered.invalidations();
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.ok(rendered.invalidations() > before, "the running row spinner should request another render");
  } finally {
    rendered.dispose();
  }
});

test("background progress updates both the summary and original delegate row through completion", async () => {
  const completion = deferred<TaskResult>();
  const renderer = createDelegateRenderer();
  let emitProgress: ((value: TaskProgress) => void) | undefined;
  let summary: string[] = [];
  const pool = new BackgroundTaskPool({
    maxConcurrent: 1,
    runTask: async (_request, onProgress, onStarted) => {
      emitProgress = onProgress;
      onStarted?.(progress());
      return completion.promise;
    },
    onSettled: (event) => renderer.updateBackgroundTask(event.progress, event.error),
    onChange: () => {
      const tasks = pool.list();
      for (const task of tasks) renderer.updateBackgroundTask(task);
      summary = renderBackgroundTasks(tasks, theme);
    },
  });

  const started = await pool.start(request);
  const rendererState = {};
  const rendered = renderRow(renderer, rendererState, started);
  try {
    emitProgress?.(progress({ currentTool: "read", activity: ["started read"] }));
    assert.match(summary.join("\n"), /reading/);
    assert.match(rendered.row.render(100).join("\n"), /reading/);

    completion.resolve({ ...progress({ status: "completed" }), output: "done" });
    await completion.promise;
    await new Promise((resolve) => setImmediate(resolve));

    // Pi rebuilds the tool row from its persisted "background started" result
    // whenever the row invalidates. The detached completion must win over it.
    renderer.renderResult(
      { content: [{ type: "text", text: "Background task started" }], details: { ...started, background: true } },
      { expanded: false, isPartial: false },
      theme,
      {
        args: { title: started.title, subagent_type: started.agent, mode: "background" },
        state: rendererState,
        isError: false,
        invalidate: () => {},
      },
    );
    assert.match(rendered.row.render(100).join("\n"), /completed/);
  } finally {
    rendered.dispose();
  }
});

test("the background summary animates a spinner for every tracked agent", async () => {
  let renders = 0;
  const widget = new BackgroundTasksWidget(
    [progress(), progress({ taskId: "task-456", agent: "general", title: "Fix code" })],
    theme,
    () => { renders += 1; },
  );
  try {
    const before = widget.render(100).join("\n");
    await new Promise((resolve) => setTimeout(resolve, 150));
    const after = widget.render(100).join("\n");
    assert.ok(renders > 0);
    assert.notEqual(after, before);
  } finally {
    widget.dispose();
  }
});
