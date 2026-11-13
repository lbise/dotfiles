import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { afterEach } from "node:test";

import extension, { activate, SESSION_COMMAND, startedByPi, thinkingLevels } from "../index.ts";

const realTerminalId = process.env.HC_TERMINAL_ID;
const cleanups: (() => unknown)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  delete (globalThis as any)[Symbol.for("herdr-chat.scope")];
  if (realTerminalId === undefined) delete process.env.HC_TERMINAL_ID;
  else process.env.HC_TERMINAL_ID = realTerminalId;
});

async function until<T>(read: () => T | undefined | false, what = "condition"): Promise<T> {
  for (let i = 0; i < 300; i++) {
    try {
      const value = read();
      if (value) return value;
    } catch {
      // not there yet
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for ${what}`);
}

const model = { provider: "anthropic", id: "claude-opus-5-5", name: "Claude Opus 5.5", reasoning: true, thinkingLevelMap: { xhigh: "x" } };

function setup({ hasUI = true } = {}) {
  const dir = join(mkdtempSync(join(tmpdir(), "herdr-chat-")), "t7");
  const handlers = new Map<string, (event: any, ctx: any) => Promise<void>>();
  const busHandlers = new Map<string, (data: unknown) => void>();
  const tools = new Map<string, any>();
  const commands = new Map<string, any>();
  const calls: any[][] = [];
  const entries: any[] = [];
  const prompts: { options: string[]; signal?: AbortSignal }[] = [];
  let draft = "";
  let thinking = "high";

  const pi = {
    on: (name: string, handler: any) => handlers.set(name, handler),
    events: { on: (channel: string, handler: any) => busHandlers.set(channel, handler) },
    registerTool: (tool: any) => tools.set(tool.name, tool),
    registerCommand: (name: string, command: any) => commands.set(name, command),
    getCommands: () => [
      { name: "skill:tdd", description: "Test first", source: "skill" },
      { name: "review", source: "prompt" },
      { name: "usage-refresh", description: "Refresh", source: "extension" },
      { name: SESSION_COMMAND, description: "Internal", source: "extension" },
    ],
    getThinkingLevel: () => thinking,
    setThinkingLevel: (level: string) => void (thinking = level),
    setModel: async (m: any) => (calls.push(["setModel", m.id]), m.provider !== "locked"),
    sendUserMessage: (content: any, options: any) => {
      calls.push(["sendUserMessage", content, options]);
      const command = typeof content === "string" && options?.expandPromptTemplates && commands.get(content.slice(1));
      if (command) void command.handler("", commandCtx);
    },
    exec: async (_cmd: string, args: string[]) => ({
      code: 0,
      killed: false,
      stdout: args.includes("--show-toplevel") ? "/home/u/rom\n" : "main\n",
    }),
  };

  const ctx = {
    hasUI,
    cwd: "/home/u/rom",
    model: model as any,
    scopedModels: [] as any[],
    modelRegistry: {
      getAvailable: () => [model, { provider: "openai", id: "gpt-6" }],
      find: (provider: string, id: string) => (provider === "nope" ? undefined : { provider, id }),
    },
    sessionManager: {
      getEntries: () => [...entries],
      getEntry: (id: string) => entries.find((e) => e.id === id),
      getLeafId: () => entries.at(-1)?.id ?? null,
      getTree: () => [] as any[],
      getCwd: () => "/home/u/rom",
      getSessionDir: () => "/sessions",
      getSessionFile: () => "/sessions/s.jsonl",
      getSessionId: () => "01a1",
      getSessionName: () => undefined as string | undefined,
    },
    isIdle: () => true,
    abort: () => calls.push(["abort"]),
    compact: (options: any) => calls.push(["compact", options]),
    getContextUsage: () => ({ tokens: 1200, contextWindow: 200000, percent: 0.6 }),
    ui: {
      getEditorText: () => draft,
      setEditorText: (text: string) => void (draft = text),
      onTerminalInput: () => () => {},
      select: (_title: string, options: string[], opts?: { signal?: AbortSignal }) =>
        new Promise<string | undefined>((resolve) => {
          prompts.push({ options, signal: opts?.signal });
          opts?.signal?.addEventListener("abort", () => resolve(undefined));
        }),
      input: async () => undefined,
    },
  };

  const commandCtx = {
    ...ctx,
    newSession: async () => (calls.push(["newSession"]), { cancelled: false }),
    reload: async () => void calls.push(["reload"]),
    switchSession: async (path: string) => (calls.push(["switchSession", path]), { cancelled: path.includes("veto") }),
    navigateTree: async (id: string, options: any) => (calls.push(["navigateTree", id, options]), { cancelled: false }),
  };
  const listed: string[][] = [];
  const sessions = async (cwd: string, sessionDir: string) => {
    listed.push([cwd, sessionDir]);
    return [
      { path: "/sessions/s.jsonl", cwd: "/home/u/rom", name: "AFH check", firstMessage: "hi", modified: new Date(2000), messageCount: 4 },
      { path: "/sessions/o.jsonl", cwd: "/home/u/rom", firstMessage: "fix\n  the bug", modified: new Date(1000), messageCount: 2 },
    ];
  };

  const saved: (string[] | undefined)[] = [];
  activate(pi as any, dir, sessions, async (_cwd, patterns) => void saved.push(patterns));
  const emit = (name: string, event: any = {}) => handlers.get(name)!(event, ctx);
  cleanups.push(() => emit("session_shutdown"));
  const state = () => JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
  let seq = 0;
  const send = (command: unknown) => writeFileSync(join(dir, "inbox", `${Date.now()}-${seq++}.json`), JSON.stringify(command));
  return { dir, pi, ctx, handlers, busHandlers, tools, commands, calls, entries, prompts, listed, saved, emit, state, send };
}

test("registers nothing outside a herdr-core terminal", () => {
  delete process.env.HC_TERMINAL_ID;
  extension({} as any); // any use of the API would throw
  process.env.HC_TERMINAL_ID = "../escape";
  extension({} as any);
});

test("a process started by another pi is recognised from its initial environment", () => {
  const file = join(mkdtempSync(join(tmpdir(), "herdr-chat-env-")), "environ");
  writeFileSync(file, "HOME=/home/u\0PI_CODING_AGENT=true\0HC_TERMINAL_ID=t7\0");
  assert.equal(startedByPi(file), true);
  writeFileSync(file, "HOME=/home/u\0PI_CODING_AGENT_DIR=/x\0HC_TERMINAL_ID=t7\0");
  assert.equal(startedByPi(file), false);
  assert.equal(startedByPi(join(file, "missing")), false);
});

test("a session without a UI writes nothing and registers no tool", async () => {
  const h = setup({ hasUI: false });
  await h.emit("session_start");
  await h.emit("agent_start");
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(existsSync(h.dir), false);
  assert.equal(h.tools.size, 0);
});

test("session start publishes the state and the commands", async () => {
  const h = setup();
  h.entries.push(
    { type: "message", message: { role: "user" } },
    { type: "message", message: { role: "assistant", usage: { cost: { total: 0.2 } } } },
    { type: "branch_summary", usage: { cost: { total: 0.05 } } }
  );
  await h.emit("session_start");
  h.busHandlers.get("usage:status")!([{ key: "usage-primary", text: "5h 38%" }, { bogus: true }]);

  const state = await until(() => h.state().git && h.state().usage.length && h.state(), "state.json");
  assert.equal(typeof state.updated, "number");
  assert.deepEqual(
    { ...state, updated: 0 },
    {
      v: 1,
      pid: process.pid,
      updated: 0,
      sessionFile: "/sessions/s.jsonl",
      sessionId: "01a1",
      title: null,
      cwd: "/home/u/rom",
      status: "idle",
      entries: 3,
      leaf: null,
      model: { provider: "anthropic", id: "claude-opus-5-5", name: "Claude Opus 5.5" },
      thinking: "high",
      models: [
        { provider: "anthropic", id: "claude-opus-5-5", name: "Claude Opus 5.5" },
        { provider: "openai", id: "gpt-6", name: "gpt-6" },
      ],
      thinkingLevels: ["off", "minimal", "low", "medium", "high", "xhigh"],
      context: { tokens: 1200, window: 200000 },
      cost: 0.25,
      git: { root: "rom", branch: "main" },
      usage: [{ key: "usage-primary", text: "5h 38%" }],
      turn: null,
      stream: null,
      ask: null,
      draft: "",
      error: null,
    }
  );
  assert.deepEqual(JSON.parse(readFileSync(join(h.dir, "commands.json"), "utf8")), {
    v: 1,
    commands: [
      { name: "skill:tdd", description: "Test first", kind: "skill" },
      { name: "review", description: "", kind: "prompt" },
      { name: "usage-refresh", description: "Refresh", kind: "command" },
    ],
  });
  assert.deepEqual([...h.tools.keys()], ["ask_user"]);
});

test("the picker offers the scoped models when pi has a scope", async () => {
  const h = setup();
  h.ctx.scopedModels = [{ model: { provider: "openai", id: "gpt-6", name: "GPT 6" } }];
  await h.emit("session_start");
  assert.deepEqual((await until(() => h.state())).models, [{ provider: "openai", id: "gpt-6", name: "GPT 6" }]);
});

test("cycle steps through the models and the thinking levels as Ctrl+P and Shift+Tab", async () => {
  const h = setup();
  await h.emit("session_start");
  h.send({ type: "cycle", what: "model" });
  await until(() => h.calls.some((call) => call[0] === "setModel"), "setModel");
  assert.deepEqual(h.calls.filter((call) => call[0] === "setModel"), [["setModel", "gpt-6"]]);
  h.send({ type: "cycle", what: "thinking" });
  await until(() => h.pi.getThinkingLevel() === "xhigh", "next level");
  h.send({ type: "cycle", what: "thinking", direction: "backward" });
  await until(() => h.pi.getThinkingLevel() === "high", "previous level");
});

test("scope narrows the models, is saved as enabledModels, and lists in models.json", async () => {
  const h = setup();
  await h.emit("session_start");
  h.send({ type: "scope", models: [{ provider: "openai", id: "gpt-6" }, { provider: "gone", id: "x" }] });
  const state = await until(() => h.state().models.length === 1 && h.state(), "scoped state");
  assert.deepEqual(state.models, [{ provider: "openai", id: "gpt-6", name: "gpt-6" }]);
  assert.deepEqual(h.saved, [["openai/gpt-6"]]);
  h.send({ type: "list", what: "models" });
  const list = await until(() => JSON.parse(readFileSync(join(h.dir, "models.json"), "utf8")), "models.json");
  assert.deepEqual(list.items.map((m: any) => [m.id, m.scoped]), [["claude-opus-5-5", false], ["gpt-6", true]]);
  // Every model is no scope.
  h.send({ type: "scope", models: [{ provider: "openai", id: "gpt-6" }, { provider: "anthropic", id: "claude-opus-5-5" }] });
  await until(() => h.saved.length === 2, "second save");
  assert.equal(h.saved[1], undefined);
});

test("thinking levels follow the model", () => {
  assert.deepEqual(thinkingLevels({ reasoning: false }), ["off"]);
  assert.deepEqual(thinkingLevels({ reasoning: true }), ["off", "minimal", "low", "medium", "high"]);
  assert.deepEqual(thinkingLevels({ reasoning: true, thinkingLevelMap: { off: null, max: "max" } }), ["minimal", "low", "medium", "high", "max"]);
  assert.deepEqual(thinkingLevels(undefined), ["off", "minimal", "low", "medium", "high", "xhigh"]);
});

test("a run publishes its steps, the streamed text and the working status", async () => {
  const h = setup();
  await h.emit("session_start");
  await h.emit("agent_start");
  await h.emit("tool_execution_start", { toolCallId: "t1", toolName: "read", args: { path: "/home/u/rom/src/a.c" } });
  await h.emit("tool_execution_start", { toolCallId: "t1/1", toolName: "grep", args: { pattern: "x" }, parentToolCallId: "t1" });
  await h.emit("tool_execution_start", { toolCallId: "t2", toolName: "bash", args: { command: "make" } });
  await h.emit("tool_execution_end", { toolCallId: "t1", toolName: "read", isError: false });
  const message = { role: "assistant", content: [{ type: "thinking", thinking: "hm" }] as any[] };
  await h.emit("message_start", { message });
  await h.emit("message_update", { message, assistantMessageEvent: { type: "thinking_delta" } });

  let state = await until(() => h.state().stream?.thinking && h.state(), "thinking stream");
  assert.equal(state.status, "working");
  assert.equal(state.turn.endedAt, null);
  assert.deepEqual(state.stream, { text: "", thinking: true });
  assert.deepEqual(
    state.turn.steps.map(({ startedAt, endedAt, ...step }: any) => ({ ...step, ended: endedAt !== null })),
    [
      { id: "t1", kind: "look", name: "read", label: "src/a.c", ok: true, ended: true },
      { id: "t2", kind: "run", name: "bash", label: "make", ended: false },
    ]
  );

  message.content.push({ type: "text", text: "The check" }, { type: "toolCall", name: "bash" });
  await h.emit("message_update", { message, assistantMessageEvent: { type: "text_delta" } });
  state = await until(() => h.state().stream?.text && h.state(), "text stream");
  assert.deepEqual(state.stream, { text: "The check", thinking: false });

  // Settling ends the turn; a tool that never reported its end counts as failed.
  await h.emit("message_end", { message });
  await h.emit("agent_settled", { aborted: true });
  state = await until(() => h.state().status === "idle" && h.state(), "idle");
  assert.equal(state.stream, null);
  assert.equal(typeof state.turn.endedAt, "number");
  assert.equal(state.turn.steps[1].ok, false);
});

test("a throwing handler is recorded in state.error and never reaches pi", async () => {
  const h = setup();
  await h.emit("session_start");
  await until(() => h.state());
  await h.emit("tool_execution_start", { toolCallId: "t1", toolName: "read", get args() { throw new Error("boom\n  in args"); } });
  assert.equal((await until(() => h.state().error && h.state(), "error")).error, "boom in args");
});

test("inbox commands run in order, and a later success clears the error", async () => {
  const h = setup();
  await h.emit("session_start");
  await until(() => h.state());

  h.send({ type: "model", provider: "nope", id: "x" });
  assert.equal((await until(() => h.state().error && h.state(), "error")).error, "model: nope/x not found");

  h.send({ type: "draft", text: "half a thought" });
  h.send({ type: "thinking", level: "low" });
  h.send({ type: "model", provider: "openai", id: "gpt-6" });
  h.send({ type: "prompt", text: "/skill:tdd go" });
  h.send({ type: "abort" });
  const state = await until(() => h.calls.length === 3 && !h.state().error && h.state().draft && h.state(), "commands");
  assert.equal(state.draft, "half a thought");
  assert.equal(state.thinking, "low");
  assert.deepEqual(h.calls, [
    ["setModel", "gpt-6"],
    ["sendUserMessage", "/skill:tdd go", { deliverAs: "steer", expandPromptTemplates: true }],
    ["abort"],
  ]);

  for (const [command, message] of [
    [{ type: "thinking", level: "huge" }, "thinking: unknown level huge"],
    [{ type: "prompt", text: " " }, "prompt: nothing to send"],
    [{ type: "prompt", text: "look", images: ["/tmp/a.txt"] }, "prompt: not an image: /tmp/a.txt"],
    [{ type: "model", provider: "locked", id: "m" }, "model: no credentials for locked"],
    [{ type: "answer", id: "a1", value: 3 }, "answer: value must be the chosen labels or a text"],
    [{ type: "dance" }, "unknown command type dance"],
  ] as const) {
    h.send(command);
    await until(() => h.state().error === message, message);
  }
});

test("a prompt carries its images", async () => {
  const h = setup();
  await h.emit("session_start");
  await until(() => h.state());
  const image = join(h.dir, "shot.PNG");
  writeFileSync(image, "png bytes");
  h.send({ type: "prompt", text: "what is this", images: [image] });
  await until(() => h.calls.length === 1, "prompt");
  assert.deepEqual(h.calls[0][1], [
    { type: "text", text: "what is this" },
    { type: "image", data: Buffer.from("png bytes").toString("base64"), mimeType: "image/png" },
  ]);
});

test("ask_user shows the question in the state and takes the answer from the inbox", async () => {
  const h = setup();
  await h.emit("session_start");
  await until(() => h.state());
  const tool = h.tools.get("ask_user");
  const result = tool.execute("call1", { question: "Which accent?", options: [{ label: "Lime", description: "bright" }, { label: "Teal" }] }, undefined, undefined, h.ctx);

  const state = await until(() => h.state().ask && h.state(), "ask");
  assert.equal(state.status, "asking");
  assert.deepEqual(state.ask, { id: "a1", question: "Which accent?", options: [{ label: "Lime", description: "bright" }, { label: "Teal" }], multi: false });
  assert.equal(h.prompts.length, 1);

  h.send({ type: "answer", id: "a1", value: ["Teal"] });
  assert.deepEqual(await result, { content: [{ type: "text", text: "The user chose: Teal" }], details: { answer: ["Teal"] } });
  assert.equal(h.prompts[0].signal!.aborted, true);
  assert.equal((await until(() => h.state().ask === null && h.state(), "ask cleared")).status, "idle");
});

test("usage entries keep their label, percent and time left", async () => {
  const h = setup();
  await h.emit("session_start");
  h.busHandlers.get("usage:status")!([
    { key: "usage-primary", text: "5h 38%", label: "5h", percent: 38.5, resets: "2h 10m", extra: 1 },
    { key: "usage-extra", text: "off", label: 3, percent: "38" },
  ]);
  assert.deepEqual((await until(() => h.state().usage.length && h.state(), "usage")).usage, [
    { key: "usage-primary", text: "5h 38%", label: "5h", percent: 38.5, resets: "2h 10m" },
    { key: "usage-extra", text: "off" },
  ]);
});

test("session commands run through the internal command, which does nothing typed by hand", async () => {
  const h = setup();
  h.entries.push({ id: "e1", type: "message", message: { role: "user" } }, { id: "e2", type: "message", message: { role: "assistant" } });
  await h.emit("session_start");
  await until(() => h.state());
  await h.commands.get(SESSION_COMMAND).handler("", h.ctx); // no pending command: no-op

  const session = join(h.dir, "old.jsonl");
  writeFileSync(session, "");
  h.send({ type: "session", action: "new" });
  h.send({ type: "session", action: "resume", path: session });
  h.send({ type: "session", action: "tree", entryId: "e1", summarize: true });
  h.send({ type: "session", action: "tree", entryId: "e2" }); // the leaf: nothing to do
  h.send({ type: "session", action: "reload" });
  h.send({ type: "session", action: "compact", instructions: " keep the plan " });
  await until(() => h.calls.some((c) => c[0] === "compact"), "compact");
  const internal = ["sendUserMessage", `/${SESSION_COMMAND}`, { expandPromptTemplates: true }];
  assert.deepEqual(h.calls.slice(0, -1), [
    internal,
    ["newSession"],
    internal,
    ["switchSession", session],
    internal,
    ["navigateTree", "e1", { summarize: true }],
    internal,
    internal,
    ["reload"],
  ]);
  assert.equal(h.calls.at(-1)![1].customInstructions, "keep the plan");
  assert.equal((await until(() => h.state().status === "compacting" && h.state(), "compacting")).error, null);

  // Refused while compacting; the end of the compaction clears the status.
  h.send({ type: "session", action: "new" });
  await until(() => h.state().error === "session: wait, Pi is compacting", "refused");
  h.calls.at(-1)![1].onComplete({});
  await until(() => h.state().status === "idle", "idle");

  for (const [command, message] of [
    [{ type: "session", action: "resume", path: join(h.dir, "missing.jsonl") }, `session: no session file ${join(h.dir, "missing.jsonl")}`],
    [{ type: "session", action: "tree", entryId: "nope" }, "session: no entry nope"],
    [{ type: "session", action: "fly" }, "session: unknown action fly"],
    [{ type: "list", what: "everything" }, "list: unknown list everything"],
  ] as const) {
    h.send(command);
    await until(() => h.state().error === message, message);
  }
  const vetoed = join(h.dir, "veto.jsonl");
  writeFileSync(vetoed, "");
  h.send({ type: "session", action: "resume", path: vetoed });
  await until(() => h.state().error === "session: resume was cancelled", "cancelled");

  h.ctx.isIdle = () => false;
  h.send({ type: "session", action: "compact" });
  await until(() => h.state().error === "session: wait, Pi is working", "refused while working");
});

test("compaction from anywhere shows as compacting; a failed one sets no status", async () => {
  const h = setup();
  await h.emit("session_start");
  h.ctx.isIdle = () => false;
  await h.emit("session_before_compact", { reason: "threshold" });
  assert.equal((await until(() => h.state().status === "compacting" && h.state(), "compacting")).status, "compacting");
  await h.emit("session_compact_failed", { reason: "threshold" });
  await until(() => h.state().status === "idle", "idle");

  h.send({ type: "session", action: "compact" }); // not idle: refused before it starts
  await until(() => h.state().error, "refused");
  h.ctx.isIdle = () => true;
  h.send({ type: "session", action: "compact" });
  await until(() => h.calls.length === 1, "compact");
  h.calls[0][1].onError(new Error("Nothing to compact (session too small)"));
  const state = await until(() => h.state().error?.startsWith("Nothing") && h.state(), "error");
  assert.equal(state.status, "idle");
});

test("moving in the tree recounts the context and ends the shown turn", async () => {
  const h = setup();
  await h.emit("session_start");
  await h.emit("agent_start");
  await h.emit("agent_settled");
  assert.ok((await until(() => h.state().turn && h.state(), "turn")).turn.endedAt);
  h.ctx.getContextUsage = () => ({ tokens: 300, contextWindow: 200000, percent: 0.1 });
  h.ctx.sessionManager.getLeafId = () => "e1";
  await h.emit("session_tree", { newLeafId: "e1" });
  const state = await until(() => h.state().turn === null && h.state(), "turn cleared");
  assert.deepEqual(state.context, { tokens: 300, window: 200000 });
  assert.equal(state.leaf, "e1");
});

test("list requests write sessions.json and tree.json", async () => {
  const h = setup();
  h.entries.push({ id: "u1", parentId: null, type: "message", timestamp: "2026-01-01T00:00:00.000Z", message: { role: "user", content: "hi" } });
  h.ctx.sessionManager.getTree = () => [{ entry: h.entries[0], children: [], label: "start" }];
  await h.emit("session_start");
  await until(() => h.state());

  h.send({ type: "list", what: "sessions" });
  h.send({ type: "list", what: "tree" });
  const read = (name: string) => JSON.parse(readFileSync(join(h.dir, name), "utf8"));
  const sessions = await until(() => read("sessions.json"), "sessions.json");
  assert.deepEqual(h.listed, [["/home/u/rom", "/sessions"]]);
  assert.equal(typeof sessions.at, "number");
  assert.deepEqual(sessions.items, [
    { path: "/sessions/s.jsonl", title: "AFH check", cwd: "/home/u/rom", modified: 2000, messages: 4, current: true },
    { path: "/sessions/o.jsonl", title: "fix the bug", cwd: "/home/u/rom", modified: 1000, messages: 2, current: false },
  ]);
  const tree = await until(() => read("tree.json"), "tree.json");
  assert.equal(tree.leaf, "u1");
  assert.deepEqual(tree.items, [
    { id: "u1", parentId: null, role: "user", text: "hi", timestamp: Date.parse("2026-01-01T00:00:00.000Z"), active: true, label: "start" },
  ]);
});
