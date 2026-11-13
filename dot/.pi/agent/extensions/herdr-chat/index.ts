/**
 * Herdr chat for pi: the Pi half of the chat view in the Herdr desktop app.
 *
 * Publishes the live session state to a per-terminal state directory, runs the commands the app
 * drops into its inbox, and registers the ask_user tool. The file protocol is the contract with
 * the Herdr mod: docs/herdr-chat.md.
 *
 * Every pi session loads this file, so it stays inert outside a herdr-core terminal, and no
 * handler lets an error reach pi: errors end up in state.error.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type FSWatcher, mkdirSync, readFileSync, watch } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, extname, join } from "node:path";

import { type AskOption, createAsker, describeAnswer } from "./ask.ts";
import { type Command, takeInbox } from "./inbox.ts";
import { createPublisher, writeJsonAtomic } from "./publish.ts";
import { type Step, stepKind, stepLabel } from "./steps.ts";

/** Sent by the usage extension: [{ key, text }] in footer order, plain text. */
const USAGE_EVENT = "usage:status";
const TICK_MS = 1000;
const MAX_ERROR = 200;

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
const IMAGE_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};
const COMMAND_KINDS: Record<string, string> = { skill: "skill", prompt: "prompt", extension: "command" };

type Turn = { startedAt: number; endedAt: number | null; steps: Step[] };

/**
 * Whether another pi started this process. Pi sets PI_CODING_AGENT=true in its own environment
 * before extensions load, so process.env cannot tell; the environment the process was started
 * with can. Linux only: elsewhere the answer is no.
 */
export function startedByPi(environFile = "/proc/self/environ"): boolean {
  try {
    return readFileSync(environFile, "utf8").split("\0").includes("PI_CODING_AGENT=true");
  } catch {
    return false;
  }
}

/** The levels pi offers for a model. Mirrors pi-ai's getSupportedThinkingLevels(), which plain `node --test` cannot import. */
export function thinkingLevels(model: { reasoning?: boolean; thinkingLevelMap?: Record<string, unknown> } | undefined): string[] {
  if (!model) return THINKING_LEVELS.slice(0, 6);
  if (!model.reasoning) return ["off"];
  return THINKING_LEVELS.filter((level) => {
    const mapped = model.thinkingLevelMap?.[level];
    return mapped !== null && (mapped !== undefined || (level !== "xhigh" && level !== "max"));
  });
}

const modelRef = (model: { provider: string; id: string; name?: string }) => ({
  provider: model.provider,
  id: model.id,
  name: model.name ?? model.id,
});

function messageText(message: any): string {
  if (!Array.isArray(message?.content)) return "";
  return message.content
    .filter((block: any) => block?.type === "text" && typeof block.text === "string")
    .map((block: any) => block.text)
    .join("\n\n");
}

async function loadImages(paths: unknown) {
  if (paths === undefined) return [];
  if (!Array.isArray(paths)) throw new Error("prompt: images must be a list of paths");
  return Promise.all(
    paths.map(async (path) => {
      const mimeType = IMAGE_TYPES[extname(String(path)).toLowerCase()];
      if (!mimeType) throw new Error(`prompt: not an image: ${path}`);
      return { type: "image" as const, data: (await readFile(String(path))).toString("base64"), mimeType };
    })
  );
}

export default function (pi: ExtensionAPI) {
  const terminalId = process.env.HC_TERMINAL_ID;
  if (!terminalId || !/^[\w.-]+$/.test(terminalId) || startedByPi()) return;
  activate(pi, join(process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"), "herdr-chat", terminalId));
}

/** Wires the extension to the state directory `dir`. Nothing is written until a session with a UI starts. */
export function activate(pi: ExtensionAPI, dir: string) {
  const inboxDir = join(dir, "inbox");

  /** Set while a session with a UI runs; everything else is a no-op without it. */
  let ctx: ExtensionContext | undefined;
  let error: string | null = null;
  let working = false;
  let turn: Turn | null = null;
  let streaming: { message: unknown; thinking: boolean } | null = null;
  let usage: { key: string; text: string }[] = [];
  let git: { root: string; branch: string } | null = null;
  // Derived from the session entries, recomputed only when their number changes.
  let entries = -1;
  let cost: number | null = null;
  let context: { tokens: number | null; window: number | null } = { tokens: null, window: null };

  let watcher: FSWatcher | undefined;
  let tick: ReturnType<typeof setInterval> | undefined;
  let offInput: (() => void) | undefined;
  let scanning = false;
  let rescan = false;
  let toolRegistered = false;

  const publisher = createPublisher(join(dir, "state.json"), build, (err) => {
    error = short(err); // not fail(): a write that keeps failing must not reschedule itself
  });
  const asker = createAsker(() => publisher.schedule());

  function short(err: unknown): string {
    const text = err instanceof Error ? err.message : String(err);
    return text.replace(/\s+/g, " ").slice(0, MAX_ERROR);
  }

  function fail(err: unknown) {
    error = short(err);
    if (ctx) publisher.schedule();
  }

  function build() {
    const c = ctx!;
    const all = c.sessionManager.getEntries();
    if (all.length !== entries) {
      entries = all.length;
      const total = all.reduce((sum, entry: any) => sum + (entry.message?.role === "assistant" ? (entry.message.usage?.cost?.total ?? 0) : 0), 0);
      cost = Math.round(total * 1e4) / 1e4;
      const used = c.getContextUsage();
      context = { tokens: used?.tokens ?? null, window: used?.contextWindow ?? null };
    }
    const scoped = c.scopedModels;
    return {
      v: 1,
      pid: process.pid,
      updated: 0,
      sessionFile: c.sessionManager.getSessionFile() ?? null,
      sessionId: c.sessionManager.getSessionId(),
      title: c.sessionManager.getSessionName() ?? null,
      cwd: c.cwd,
      status: asker.current() ? "asking" : working ? "working" : "idle",
      entries,
      model: c.model ? modelRef(c.model) : null,
      thinking: pi.getThinkingLevel(),
      models: (scoped.length ? scoped.map((s) => s.model) : c.modelRegistry.getAvailable()).map(modelRef),
      thinkingLevels: thinkingLevels(c.model),
      context,
      cost,
      git,
      usage,
      turn,
      stream: streaming ? { text: messageText(streaming.message), thinking: streaming.thinking } : null,
      ask: asker.current(),
      draft: c.ui.getEditorText(),
      error,
    };
  }

  async function refreshGit(c: ExtensionContext) {
    try {
      const run = async (...args: string[]) => {
        const { stdout, code, killed } = await pi.exec("git", args, { cwd: c.cwd, timeout: 2000 });
        return code !== 0 || killed ? "" : stdout.trim();
      };
      const root = await run("rev-parse", "--show-toplevel");
      // A detached HEAD has no current branch: show its commit.
      git = root ? { root: basename(root), branch: (await run("branch", "--show-current")) || (await run("rev-parse", "--short", "HEAD")) } : null;
      if (ctx) publisher.schedule();
    } catch (err) {
      fail(err);
    }
  }

  async function run(command: Command, c: ExtensionContext) {
    switch (command.type) {
      case "prompt": {
        const text = typeof command.text === "string" ? command.text : "";
        const images = await loadImages(command.images);
        if (!text.trim() && !images.length) throw new Error("prompt: nothing to send");
        // deliverAs only matters while the agent works; slash commands, skills and templates expand as if typed.
        pi.sendUserMessage(images.length ? [{ type: "text", text }, ...images] : text, {
          deliverAs: "steer",
          expandPromptTemplates: true,
        });
        return;
      }
      case "abort":
        c.abort();
        return;
      case "model": {
        const model = c.modelRegistry.find(String(command.provider), String(command.id));
        if (!model) throw new Error(`model: ${command.provider}/${command.id} not found`);
        if (!(await pi.setModel(model))) throw new Error(`model: no credentials for ${model.provider}`);
        return;
      }
      case "thinking":
        if (!THINKING_LEVELS.includes(command.level as string)) throw new Error(`thinking: unknown level ${command.level}`);
        pi.setThinkingLevel(command.level as any);
        return;
      case "answer": {
        const value = command.value;
        if (typeof value !== "string" && !(Array.isArray(value) && value.every((v) => typeof v === "string"))) {
          throw new Error("answer: value must be the chosen labels or a text");
        }
        asker.answer(command.id, value); // false for an id that already got its answer: nothing to do
        return;
      }
      case "draft":
        c.ui.setEditorText(typeof command.text === "string" ? command.text : "");
        return;
      default:
        throw new Error(`unknown command type ${command.type}`);
    }
  }

  /** Runs the inbox one command at a time; a scan asked for meanwhile runs right after. */
  async function scan() {
    if (scanning) {
      rescan = true;
      return;
    }
    scanning = true;
    try {
      do {
        rescan = false;
        const { commands, errors } = await takeInbox(inboxDir);
        errors.forEach(fail);
        for (const command of commands) {
          if (!ctx) return;
          try {
            await run(command, ctx);
            error = null;
            publisher.schedule();
          } catch (err) {
            fail(err);
          }
        }
      } while (rescan);
    } catch (err) {
      fail(err);
    } finally {
      scanning = false;
    }
  }

  function registerAskTool() {
    if (toolRegistered) return;
    toolRegistered = true;
    pi.registerTool({
      name: "ask_user",
      label: "Ask user",
      description:
        "Ask the user one question and wait for their answer. Give 2 to 6 short, distinct options, each with a description when the label alone does not explain the trade-off. The user can also answer in their own words. Set multi to let them choose several. Returns the chosen labels or the user's text.",
      promptSnippet: "Ask the user a question with options when a decision is theirs to make",
      promptGuidelines: [
        "Use ask_user only for a real decision that belongs to the user and blocks the work: a choice between approaches with different trade-offs, a requirement you cannot infer, or a risky or irreversible action. Do not use ask_user for what the code or the conversation already answers, for routine confirmation, or to ask whether to continue; take the sensible default and say what you assumed.",
      ],
      // Plain JSON Schema: keeps this file free of runtime imports from pi.
      parameters: {
        type: "object",
        properties: {
          question: { type: "string", description: "The question, in one or two sentences" },
          options: {
            type: "array",
            description: "The choices, 2 to 6. Do not add an 'other' option: the user can always type an answer",
            items: {
              type: "object",
              properties: {
                label: { type: "string", description: "Short name of the choice" },
                description: { type: "string", description: "What choosing it means" },
              },
              required: ["label"],
            },
          },
          multi: { type: "boolean", description: "Let the user choose several options. Default: false" },
        },
        required: ["question", "options"],
      } as any,
      executionMode: "sequential",
      async execute(_toolCallId, params: { question: string; options: AskOption[]; multi?: boolean }, signal, _onUpdate, c) {
        try {
          const options = (params.options ?? []).map(({ label, description }) => ({ label, description }));
          const answer = await asker.ask(c.ui, { question: params.question, options, multi: params.multi === true }, signal);
          return { content: [{ type: "text", text: describeAnswer(answer) }], details: { answer: answer ?? null } };
        } catch (err) {
          fail(err);
          throw err;
        }
      },
    });
  }

  function stop() {
    watcher?.close();
    watcher = undefined;
    if (tick) clearInterval(tick);
    tick = undefined;
    offInput?.();
    offInput = undefined;
    publisher.stop();
  }

  /** Registers a handler that cannot throw into pi; each handled event schedules a state write. */
  function on(event: string, handler: (event: any, c: ExtensionContext) => unknown = () => {}) {
    (pi.on as any)(event, async (e: any, c: ExtensionContext) => {
      try {
        if (event === "session_start" ? !c.hasUI : !ctx) return;
        ctx = c;
        await handler(e, c);
        if (ctx) publisher.schedule();
      } catch (err) {
        fail(err);
      }
    });
  }

  pi.events.on(USAGE_EVENT, (data) => {
    if (!Array.isArray(data)) return;
    usage = data.filter((item) => typeof item?.key === "string" && typeof item?.text === "string").map(({ key, text }) => ({ key, text }));
    if (ctx) publisher.schedule();
  });

  on("session_start", (_event, c) => {
    stop();
    mkdirSync(inboxDir, { recursive: true, mode: 0o700 });
    working = !c.isIdle(); // a reload can land in the middle of a run
    turn = working ? { startedAt: Date.now(), endedAt: null, steps: [] } : null;
    registerAskTool();
    writeJsonAtomic(join(dir, "commands.json"), {
      v: 1,
      commands: pi.getCommands().map((command) => ({
        name: command.name,
        description: command.description ?? "",
        kind: COMMAND_KINDS[command.source] ?? "command",
      })),
    });

    // The tick picks up what no event announces (a typed draft, entries added by other extensions)
    // and covers an inbox watcher that failed or missed a file.
    tick = setInterval(() => {
      void scan();
      publisher.schedule();
    }, TICK_MS);
    tick.unref?.();
    try {
      watcher = watch(inboxDir, () => void scan());
      watcher.on("error", () => undefined);
    } catch {
      // the tick still scans
    }
    offInput = c.ui.onTerminalInput(() => {
      publisher.schedule(); // runs after pi handled the key, so the draft is current
      return undefined;
    });
    void refreshGit(c);
    void scan();
  });

  on("session_shutdown", () => {
    stop();
    ctx = undefined;
  });

  on("agent_start", () => {
    working = true;
    // A retry starts the agent again without settling: same turn.
    if (!turn || turn.endedAt !== null) turn = { startedAt: Date.now(), endedAt: null, steps: [] };
  });

  on("agent_settled", (_event, c) => {
    if (!c.isIdle()) return;
    const now = Date.now();
    working = false;
    streaming = null;
    if (turn && turn.endedAt === null) {
      turn.endedAt = now;
      for (const step of turn.steps) {
        if (step.endedAt !== null) continue;
        step.endedAt = now;
        step.ok = false;
      }
    }
    void refreshGit(c);
  });

  on("tool_execution_start", (event, c) => {
    if (event.parentToolCallId) return; // calls made by another tool are not in the transcript
    turn ??= { startedAt: Date.now(), endedAt: null, steps: [] };
    turn.steps.push({
      id: event.toolCallId,
      kind: stepKind(event.toolName),
      name: event.toolName,
      label: stepLabel(event.args, c.cwd),
      startedAt: Date.now(),
      endedAt: null,
    });
  });

  on("tool_execution_end", (event, c) => {
    const step = turn?.steps.findLast((s) => s.id === event.toolCallId);
    if (!step) return;
    step.endedAt = Date.now();
    step.ok = !event.isError;
    if (step.kind === "run") void refreshGit(c); // a command may have switched branch
  });

  on("message_start", (event) => {
    if (event.message?.role === "assistant") streaming = { message: event.message, thinking: false };
  });

  on("message_update", (event) => {
    if (event.message?.role !== "assistant") return;
    const type = event.assistantMessageEvent?.type;
    streaming = { message: event.message, thinking: type === "thinking_start" || type === "thinking_delta" };
  });

  on("message_end", (event) => {
    if (event.message?.role === "assistant") streaming = null;
  });

  // Nothing to track, but the state they change should go out at once.
  for (const event of ["turn_end", "model_select", "thinking_level_select", "session_info_changed", "session_compact", "session_tree"]) {
    on(event);
  }
}
