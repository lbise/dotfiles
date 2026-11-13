import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { afterEach } from "node:test";

import extension, { activate, startedByPi, thinkingLevels } from "../index.ts";

const realTerminalId = process.env.HC_TERMINAL_ID;
const cleanups: (() => unknown)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
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
  const calls: any[][] = [];
  const entries: any[] = [];
  const prompts: { options: string[]; signal?: AbortSignal }[] = [];
  let draft = "";
  let thinking = "high";

  const pi = {
    on: (name: string, handler: any) => handlers.set(name, handler),
    events: { on: (channel: string, handler: any) => busHandlers.set(channel, handler) },
    registerTool: (tool: any) => tools.set(tool.name, tool),
    getCommands: () => [
      { name: "skill:tdd", description: "Test first", source: "skill" },
      { name: "review", source: "prompt" },
      { name: "usage-refresh", description: "Refresh", source: "extension" },
    ],
    getThinkingLevel: () => thinking,
    setThinkingLevel: (level: string) => void (thinking = level),
    setModel: async (m: any) => (calls.push(["setModel", m.id]), m.provider !== "locked"),
    sendUserMessage: (content: any, options: any) => calls.push(["sendUserMessage", content, options]),
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
      getSessionFile: () => "/sessions/s.jsonl",
      getSessionId: () => "01a1",
      getSessionName: () => undefined as string | undefined,
    },
    isIdle: () => true,
    abort: () => calls.push(["abort"]),
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

  activate(pi as any, dir);
  const emit = (name: string, event: any = {}) => handlers.get(name)!(event, ctx);
  cleanups.push(() => emit("session_shutdown"));
  const state = () => JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
  let seq = 0;
  const send = (command: unknown) => writeFileSync(join(dir, "inbox", `${Date.now()}-${seq++}.json`), JSON.stringify(command));
  return { dir, pi, ctx, handlers, busHandlers, tools, calls, entries, prompts, emit, state, send };
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
  h.entries.push({ type: "message", message: { role: "user" } }, { type: "message", message: { role: "assistant", usage: { cost: { total: 0.25 } } } });
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
      entries: 2,
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
