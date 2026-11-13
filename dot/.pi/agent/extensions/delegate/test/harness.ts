// Real Pi with the delegate extension and pi-ai's faux provider: no network, scripted models.
// Needs `--import ./delegate/test/pi-resolve.mjs`.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import {
  type AgentSessionRuntime,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

type Msg = { role: string; content: unknown };
type Reply = ReturnType<typeof fauxAssistantMessage>;
export type ParentStep = (seen: string) => Reply | Promise<Reply>;

function text(message: Msg | undefined): string {
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  return (message.content as Array<{ type: string; text?: string }>).map((part) => part.text ?? "").join("");
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

export const say = (value: string) => fauxAssistantMessage(fauxText(value));
export const call = (...calls: Array<Record<string, unknown>>) =>
  fauxAssistantMessage(calls.map((args) => fauxToolCall("delegate", args)), { stopReason: "toolUse" });

/**
 * Children are prompted `CHILD:<name>` and answer only when the test calls `release(name)`.
 * The parent answers from `parent`, a queue of steps, each given the text of the context it saw.
 */
export async function harness() {
  const agentDir = mkdtempSync(join(tmpdir(), "delegate-agent-"));
  const cwd = mkdtempSync(join(tmpdir(), "delegate-cwd-"));
  process.env.PI_CODING_AGENT_DIR = agentDir;
  const faux = fauxProvider({ provider: "faux", models: [{ id: "m" }] });
  const gates = new Map<string, ReturnType<typeof deferred<Reply>>>();
  const gate = (name: string) => {
    if (!gates.has(name)) gates.set(name, deferred<Reply>());
    return gates.get(name)!;
  };
  const parent: ParentStep[] = [];
  const parentSaw: string[] = [];
  const childStarted = new Set<string>();
  const tasks: unknown[][] = []; // every delegate:tasks event

  const route = async (context: { messages: Msg[] }, options?: { signal?: AbortSignal }) => {
    const users = context.messages.filter((message) => message.role === "user");
    if (text(users[0]).startsWith("CHILD:")) {
      const name = text(users.at(-1)).slice("CHILD:".length);
      childStarted.add(name);
      // Like a real provider, an aborted request ends at once.
      const aborted = new Promise<Reply>((resolve) => {
        if (options?.signal?.aborted) resolve(fauxAssistantMessage("", { stopReason: "aborted" }));
        options?.signal?.addEventListener("abort", () => resolve(fauxAssistantMessage("", { stopReason: "aborted" })), { once: true });
      });
      return Promise.race([gate(name).promise, aborted]);
    }
    const seen = context.messages.map(text).join("\n");
    parentSaw.push(seen);
    const step = parent.shift();
    if (!step) throw new Error(`parent has no scripted reply; it saw:\n${seen.slice(-500)}`);
    return step(seen);
  };
  faux.setResponses(Array.from({ length: 500 }, () => route));

  const runtime: AgentSessionRuntime = await createAgentSessionRuntime(async ({ cwd, sessionManager, sessionStartEvent }) => {
    const services = await createAgentSessionServices({
      cwd, agentDir,
      resourceLoaderOptions: {
        noExtensions: true,
        additionalExtensionPaths: [join(import.meta.dirname, "..", "index.ts")],
        extensionFactories: [(pi) => {
          pi.registerProvider(faux.provider);
          pi.events.on("delegate:tasks", (data) => tasks.push(data as unknown[]));
        }],
      },
    });
    const created = await createAgentSessionFromServices({ services, sessionManager, sessionStartEvent, model: faux.getModel() });
    return { ...created, services, diagnostics: services.diagnostics };
  }, { cwd, agentDir, sessionManager: SessionManager.create(cwd) });

  const bind = () => runtime.session.bindExtensions({ mode: "rpc" });
  await bind();

  return {
    runtime, cwd, agentDir, parent, parentSaw, bind, tasks,
    release(name: string, reply: Reply = say(`result of ${name}`)) { gate(name).resolve(reply); },
    childStarted: (name: string) => childStarted.has(name),
    entries: () => runtime.session.sessionManager.getEntries() as Array<Record<string, any>>,
    async dispose() {
      for (const g of gates.values()) g.resolve(say("late"));
      await runtime.dispose();
    },
  };
}

export async function until(condition: () => boolean, what: string, ms = 5_000): Promise<void> {
  const end = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** Ledger rows and completion messages by run id. */
export function ledger(entries: Array<Record<string, any>>) {
  const runs = new Map<string, { started: number; ended: any[]; delivered: any[] }>();
  const row = (runId: string) => {
    if (!runs.has(runId)) runs.set(runId, { started: 0, ended: [], delivered: [] });
    return runs.get(runId)!;
  };
  for (const entry of entries) {
    if (entry.type === "custom" && entry.customType === "delegate-task") {
      if (entry.data.phase === "started") row(entry.data.runId).started++;
      else row(entry.data.runId).ended.push(entry.data);
    }
    if (entry.type === "custom_message" && entry.customType === "delegate-completion") {
      row(entry.details.runId).delivered.push(entry);
    }
  }
  return runs;
}

/** Every started run ended once and was delivered once. */
export function assertInvariant(entries: Array<Record<string, any>>): void {
  for (const [runId, run] of ledger(entries)) {
    if (run.started !== 1 || run.ended.length !== 1 || run.delivered.length !== 1) {
      throw new Error(`run ${runId}: started ${run.started}, ended ${run.ended.length}, delivered ${run.delivered.length}`);
    }
  }
}
