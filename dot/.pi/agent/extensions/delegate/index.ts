import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  SessionManager,
  truncateHead,
} from "@earendil-works/pi-coding-agent";
import { discoverAgents, type TaskAgent } from "./agents.ts";
import { configureAgents } from "./config.ts";
import {
  COMPLETION_TYPE,
  completionText,
  type EndedRecord,
  interruptedRecord,
  LEDGER_TYPE,
  reconcile,
  type StartedRecord,
} from "./ledger.ts";
import { DelegateParameters } from "./parameters.ts";
import { childToolAllowlist } from "./policy.ts";
import {
  BackgroundTaskDetailOverlay,
  BackgroundTasksWidget,
  createDelegateRenderer,
  renderDelegateCompletion,
} from "./render.ts";
import { runTask, type RunTaskRequest, type TaskProgress } from "./runner.ts";
import { loadDelegateConfiguration } from "./settings.ts";
import { childSessionLabel, childSessions, siblingPath } from "./sessions.ts";

const extensionDir = dirname(fileURLToPath(import.meta.url));
const packagedDir = join(extensionDir, "agents");
const projectConfirmations = new Map<string, Set<string>>();
const MAX_BACKGROUND_TASKS = 8;
const SHUTDOWN_WAIT_MS = 5_000;
/** pi.events channel with the running subagents (foreground and background), for herdr-chat. */
export const TASKS_EVENT = "delegate:tasks";
const TASK_SHORTCUTS = ["ctrl+1", "ctrl+2", "ctrl+3", "ctrl+4", "ctrl+5", "ctrl+6", "ctrl+7", "ctrl+8", "ctrl+9", "ctrl+0"] as const;
type TaskShortcut = typeof TASK_SHORTCUTS[number];
type TaskShortcutEntry = {
  key: TaskShortcut;
  parentSessionPath: string;
  taskId?: string;
  sessionPath?: string;
  title: string;
  progress?: TaskProgress;
};

/** A background subagent of this extension instance. Instances never share runs. */
type Run = {
  runId: string;
  toolCallId: string;
  startedAt: number;
  controller: AbortController;
  progress: TaskProgress;
  /** Set once the child session exists and the ledger has its `started` row. */
  started?: StartedRecord;
  rejectStart: (error: Error) => void;
  done: Promise<void>;
};

function userAgentsDir(): string {
  return join(process.env.PI_CODING_AGENT_DIR ?? join(process.env.HOME ?? "", ".pi", "agent"), "agents");
}

function discovery(ctx: { cwd: string; isProjectTrusted(): boolean }) {
  const projectTrusted = ctx.isProjectTrusted();
  const found = discoverAgents({ packagedDir, userDir: userAgentsDir(), cwd: ctx.cwd, projectTrusted });
  return configureAgents(found, loadDelegateConfiguration(ctx.cwd, projectTrusted));
}

// Wording follows Claude Code's Agent tool (docs/research/subagents-value-and-execution-modes.md).
function delegateDescription(agents: TaskAgent[]): string {
  const choices = agents.filter((agent) => !agent.hidden).map((agent) => `- ${agent.name}: ${agent.description}`).join("\n") || "- none";
  return [
    "Launch a subagent: a named child agent with its own isolated context window. It receives its prompt and normal project context, never your transcript, and returns only its final report.",
    "**Do not spawn subagents unless the user asks.** Each spawn starts cold and re-derives context you already have. A task with \"multiple angles,\" \"thorough,\" or several parts is not a request to spawn; handle it inline with your own tools. Only use this tool when the user explicitly says to use a subagent, names one of the available agent types, or a skill or AGENTS.md instruction tells you to.",
    "Subagents run in the background; you'll be notified when one completes. Pass run_in_background: false only when your very next action depends on the result and nothing else could usefully happen while it runs.",
    "Never fabricate or predict a pending subagent's results. The notification is never something you write yourself; if the user asks before it arrives, say it's still running. Once you have delegated work, don't also do it yourself.",
    "The subagent's final report is not a reply to the user: relay what matters.",
    "The prompt is the child's complete instruction: include the goal, relevant context and constraints, and the expected result. The title is a short human-facing label.",
    "Pass task_id to continue an earlier subagent with its context intact; a call without task_id starts fresh. Subagents cannot spawn subagents.",
    "Available subagents:", choices,
  ].join("\n");
}

function truncateTaskOutput(output: string, sessionPath: string | undefined): string {
  const truncation = truncateHead(output, {
    maxBytes: DEFAULT_MAX_BYTES - 1_024,
    maxLines: DEFAULT_MAX_LINES - 10,
  });
  if (!truncation.truncated) return truncation.content;
  const location = sessionPath ? ` Full output remains in child session ${sessionPath}.` : "";
  return `${truncation.content}\n\n[Output truncated: ${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}.${location}]`;
}

function parentSessionPath(ctx: ExtensionContext): string | undefined {
  const sessionPath = ctx.sessionManager.getSessionFile();
  if (!sessionPath) return undefined;
  return ctx.sessionManager.getHeader()?.parentSession ?? sessionPath;
}

async function confirmProjectAgent(agent: TaskAgent, ctx: ExtensionContext): Promise<boolean> {
  if (agent.source !== "project") return true;
  if (!ctx.hasUI) return false;
  const parent = ctx.sessionManager.getSessionFile() ?? `ephemeral:${ctx.sessionManager.getSessionId()}`;
  const accepted = projectConfirmations.get(parent) ?? new Set<string>();
  if (accepted.has(agent.name)) return true;
  const confirmed = await ctx.ui.confirm("Run project agent?", `${agent.name} is defined by ${agent.filePath}. Run it?`);
  if (confirmed) {
    accepted.add(agent.name);
    projectConfirmations.set(parent, accepted);
  }
  return confirmed;
}

function copy(progress: TaskProgress): TaskProgress {
  return { ...progress, activity: [...progress.activity] };
}

export default function delegateExtension(pi: ExtensionAPI) {
  const activeTaskIds = new Set<string>();
  const runs = new Map<string, Run>();
  /** Foreground subagents by tool call id. */
  const foreground = new Map<string, { startedAt: number; progress: TaskProgress }>();
  const taskShortcuts = new Map<string, Map<TaskShortcut, TaskShortcutEntry>>();
  const delegateRenderer = createDelegateRenderer();
  let ui: ExtensionContext["ui"] | undefined;
  let detailTui: { requestRender(): void } | undefined;

  function publishTasks(): void {
    const live = (id: string, startedAt: number, progress: TaskProgress, background: boolean) => ({
      id, background, startedAt, taskId: progress.taskId || null, title: progress.title, agent: progress.agent,
      status: progress.status, sessionPath: progress.sessionPath ?? null, currentTool: progress.currentTool ?? null,
      model: progress.model ?? null, turns: progress.turns ?? 0, tokens: progress.tokens ?? 0, cost: progress.cost ?? 0,
    });
    pi.events.emit(TASKS_EVENT, [
      ...[...foreground].map(([id, run]) => live(id, run.startedAt, run.progress, false)),
      ...[...runs.values()].map((run) => live(run.toolCallId, run.startedAt, run.progress, true)),
    ]);
  }

  function refreshWidget(): void {
    publishTasks();
    const tasks = [...runs.values()].map((run) => copy(run.progress));
    for (const task of tasks) delegateRenderer.updateBackgroundTask(task);
    ui?.setWidget(
      "delegate-background-tasks",
      tasks.length ? (tui, theme) => new BackgroundTasksWidget(tasks, theme, () => tui.requestRender()) : undefined,
      { placement: "aboveEditor" },
    );
    try { detailTui?.requestRender(); } catch {}
  }

  /** Puts an ended run in front of the model: at once (a turn when idle) or, on reconcile, stored for the next prompt. */
  function deliver(ended: EndedRecord, triggerTurn: boolean): void {
    const output = truncateTaskOutput(ended.output || ended.error || "(no output)", ended.sessionPath);
    pi.sendMessage(
      {
        customType: COMPLETION_TYPE,
        content: completionText(ended, output),
        display: true,
        details: { ...ended, background: true, error: ended.error?.slice(0, 500) },
      },
      { deliverAs: "followUp", triggerTurn },
    );
  }

  function settle(run: Run, progress: TaskProgress, output?: string, error?: unknown): void {
    if (runs.get(run.runId) !== run) return; // shutdown already closed it
    runs.delete(run.runId);
    const message = error === undefined ? undefined : error instanceof Error ? error.message : String(error);
    const final = { ...copy(progress), currentTool: undefined };
    if (final.status === "queued" || final.status === "running") final.status = run.controller.signal.aborted ? "aborted" : "failed";
    delegateRenderer.updateBackgroundTask(final, message ? new Error(message) : undefined);
    refreshWidget();
    if (!run.started) {
      run.rejectStart(new Error(message ?? "Subagent finished before reporting its task_id"));
      return;
    }
    const ended: EndedRecord = {
      ...run.started, phase: "ended", status: final.status, output, error: message ?? final.error,
      model: final.model, turns: final.turns, tokens: final.tokens, cost: final.cost,
    };
    pi.appendEntry(LEDGER_TYPE, ended);
    deliver(ended, true);
  }

  /** Resolves with the child's progress once its session exists; the run then continues on its own. */
  function startBackground(request: RunTaskRequest, toolCallId: string): Promise<TaskProgress> {
    if (runs.size >= MAX_BACKGROUND_TASKS) {
      return Promise.reject(new Error(`Too many background subagents. Maximum: ${MAX_BACKGROUND_TASKS}`));
    }
    return new Promise<TaskProgress>((resolveStart, rejectStart) => {
      const run: Run = {
        runId: randomUUID(),
        toolCallId,
        startedAt: Date.now(),
        controller: new AbortController(),
        progress: {
          status: "queued", taskId: request.taskId ?? "", agent: request.agent.name,
          title: request.title, shortcut: request.shortcut, activity: [],
        },
        rejectStart,
        done: Promise.resolve(),
      };
      runs.set(run.runId, run);
      refreshWidget();
      const current = () => runs.get(run.runId) === run;
      // A parent abort (Esc) must not reach a background child: it gets its own signal.
      run.done = runTaskWithShortcuts(
        { ...request, signal: run.controller.signal },
        (progress) => {
          if (!current()) return;
          run.progress = copy(progress);
          refreshWidget();
        },
        (progress) => {
          if (!current()) return;
          run.progress = copy(progress);
          run.started = {
            runId: run.runId, phase: "started", taskId: progress.taskId, sessionPath: progress.sessionPath,
            agent: progress.agent, title: progress.title,
          };
          pi.appendEntry(LEDGER_TYPE, run.started);
          resolveStart(copy(progress));
        },
      ).then(
        (result) => settle(run, result, result.output),
        (error) => settle(run, run.progress, undefined, error),
      );
    });
  }

  function runningTaskIds(): Set<string> {
    return new Set([...activeTaskIds, ...[...runs.values()].map((run) => run.progress.taskId).filter(Boolean)]);
  }

  /** Switching away from this session interrupts its background subagents; ask first. */
  async function confirmLeave(ctx: ExtensionContext): Promise<boolean> {
    if (runs.size === 0 || !ctx.hasUI) return true;
    return ctx.ui.confirm(
      "Interrupt background subagents?",
      `${runs.size} background subagent${runs.size === 1 ? " is" : "s are"} running. Switching sessions interrupts ${runs.size === 1 ? "it" : "them"}; each can be continued later with its task_id.`,
    );
  }

  function shortcutsFor(parent: string, create = false): Map<TaskShortcut, TaskShortcutEntry> | undefined {
    let entries = taskShortcuts.get(parent);
    if (!entries && create) {
      entries = new Map();
      taskShortcuts.set(parent, entries);
    }
    return entries;
  }

  function allocateTaskShortcut(ctx: ExtensionContext, title: string, taskId?: string): TaskShortcut | undefined {
    const parent = parentSessionPath(ctx);
    if (!parent) return undefined;
    const entries = shortcutsFor(parent, true)!;
    if (taskId) {
      const existing = [...entries.entries()].find(([, entry]) => entry.taskId === taskId);
      if (existing) return existing[0];
    }
    const key = TASK_SHORTCUTS.find((candidate) => !entries.has(candidate));
    if (!key) return undefined;
    entries.set(key, { key, parentSessionPath: parent, taskId, title });
    return key;
  }

  function updateTaskShortcut(parent: string | undefined, key: TaskShortcut | undefined, progress: TaskProgress): void {
    if (!parent || !key) return;
    const entry = shortcutsFor(parent)?.get(key);
    if (!entry) return;
    entry.taskId = progress.taskId;
    entry.sessionPath = progress.sessionPath;
    entry.progress = copy(progress);
  }

  function releaseTaskShortcut(parent: string | undefined, key: TaskShortcut | undefined): void {
    if (!parent || !key) return;
    const entries = shortcutsFor(parent);
    const entry = entries?.get(key);
    if (entry && !entry.sessionPath) entries?.delete(key);
    if (entries?.size === 0) taskShortcuts.delete(parent);
  }

  async function openTaskShortcut(key: string, ctx: ExtensionCommandContext): Promise<void> {
    if (!(TASK_SHORTCUTS as readonly string[]).includes(key)) {
      ctx.ui.notify(`Unknown delegate shortcut: ${key}`, "warning");
      return;
    }
    const parent = parentSessionPath(ctx);
    const entry = parent ? shortcutsFor(parent)?.get(key as TaskShortcut) : undefined;
    if (!entry) {
      ctx.ui.notify(`${key} is not assigned to a task in this session.`, "info");
      return;
    }
    if (!entry.sessionPath) {
      ctx.ui.notify(`${key} is assigned to ${entry.title}, but its session is not ready yet.`, "info");
      return;
    }
    if (!(await confirmLeave(ctx))) return;
    try {
      await ctx.switchSession(entry.sessionPath);
    } catch (error) {
      ctx.ui.notify(`Could not open ${entry.title}: ${error instanceof Error ? error.message : String(error)}`, "error");
    }
  }

  async function inspectTaskShortcut(key: string, ctx: ExtensionContext): Promise<void> {
    if (!(TASK_SHORTCUTS as readonly string[]).includes(key)) return;
    if (ctx.mode !== "tui") {
      ctx.ui.notify("Delegate detail overlays require the TUI.", "warning");
      return;
    }
    const parent = parentSessionPath(ctx);
    const entry = parent ? shortcutsFor(parent)?.get(key as TaskShortcut) : undefined;
    if (!entry) {
      ctx.ui.notify(`${key} is not assigned to a task in this session.`, "info");
      return;
    }
    const snapshot = () => {
      const run = [...runs.values()].find((candidate) => entry.taskId && candidate.progress.taskId === entry.taskId);
      if (run) return { progress: copy(run.progress), settled: false };
      if (!entry.progress) return undefined;
      return { progress: entry.progress, settled: !["queued", "running"].includes(entry.progress.status) };
    };
    await ctx.ui.custom<void>((tui, theme, _keybindings, done) => {
      detailTui = tui;
      return new BackgroundTaskDetailOverlay(key, theme, snapshot, done, () => {
        if (detailTui === tui) detailTui = undefined;
      });
    }, {
      overlay: true,
      overlayOptions: { anchor: "center", width: "80%", maxHeight: "80%", minWidth: 60 },
    });
    detailTui = undefined;
  }

  pi.registerCommand("delegate-open", {
    description: "Open a delegated task session by shortcut",
    handler: (args, ctx) => {
      const key = args.trim();
      // Let command dispatch finish before replacing the session.
      setTimeout(() => void openTaskShortcut(key, ctx), 0);
    },
  });

  for (const key of TASK_SHORTCUTS) {
    pi.registerShortcut(key, {
      description: `Inspect delegated task ${key}`,
      handler: (ctx) => inspectTaskShortcut(key, ctx),
    });
  }

  const runTaskWithShortcuts = (
    request: RunTaskRequest,
    onProgress?: (progress: TaskProgress) => void,
    onStarted?: (progress: TaskProgress) => void,
  ) => runTask(request, (progress) => {
    updateTaskShortcut(request.parentSessionPath, request.shortcut as TaskShortcut | undefined, progress);
    onProgress?.(progress);
  }, onStarted);

  pi.registerMessageRenderer(COMPLETION_TYPE, renderDelegateCompletion);

  pi.registerTool({
    name: "delegate",
    label: "Delegate",
    description: "Run a named subagent in an isolated context window. It runs in the background by default and you are notified when it completes. Do not spawn subagents unless the user asks.",
    promptSnippet: "Spawn a subagent, only when the user asks for one",
    promptGuidelines: [
      "Do not call delegate unless the user explicitly asks for a subagent or names an agent type, or a skill or AGENTS.md instruction says to. Thoroughness, several angles or several parts are not such a request.",
      "delegate runs in the background by default; pass run_in_background: false only when your very next action depends on the result and nothing else could usefully happen meanwhile.",
      "Never fabricate or predict a pending subagent's result; if asked before its delegate-completion message arrives, say it is still running.",
      "When a delegate-completion message arrives, read its <task> body and relay what matters to the user; the subagent's report is not shown as your answer.",
    ],
    renderShell: "self",
    parameters: DelegateParameters,
    renderCall: delegateRenderer.renderCall,
    renderResult: delegateRenderer.renderResult,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const found = discovery(ctx);
      const agent = found.agents.find((candidate) => candidate.name === params.subagent_type);
      if (!agent) {
        throw new Error(`Unknown subagent ${params.subagent_type}.\n${delegateDescription(found.agents)}`);
      }
      if (!(await confirmProjectAgent(agent, ctx))) {
        throw new Error("Project agent execution was not approved.");
      }
      if (params.task_id && runningTaskIds().has(params.task_id)) {
        throw new Error(`task_id is already running: ${params.task_id}`);
      }
      const parentTools = childToolAllowlist(pi.getActiveTools().filter((tool) => tool !== "delegate"), agent.tools);
      if (agent.tools && parentTools.length === 0) {
        throw new Error(`No permitted tools remain for ${agent.name}.`);
      }
      // Completions need a follow-up turn, which only TUI and RPC sessions have.
      const background = params.run_in_background !== false && (ctx.mode === "tui" || ctx.mode === "rpc");
      const shortcut = allocateTaskShortcut(ctx, params.title, params.task_id);
      const request: RunTaskRequest = {
        agent, title: params.title, prompt: params.prompt, taskId: params.task_id, shortcut,
        cwd: ctx.cwd, parentSessionPath: ctx.sessionManager.getSessionFile(), parentTools,
        parentModel: ctx.model,
        parentThinking: ctx.thinkingLevel, modelRegistry: ctx.modelRegistry,
        projectTrusted: ctx.isProjectTrusted(),
      };
      if (shortcut) {
        onUpdate?.({
          content: [{ type: "text", text: `queued: ${params.title}` }],
          details: {
            status: "queued", taskId: "", agent: agent.name, title: params.title,
            shortcut, activity: [],
          },
        });
      }

      if (background) {
        if (ctx.mode === "tui") ui = ctx.ui;
        try {
          const started = await startBackground(request, toolCallId);
          return {
            content: [{
              type: "text",
              text: `<task id="${started.taskId}" state="running" background="true">\nSubagent started in the background. This is only its task_id, not its result. You will be notified when it completes: do not wait, poll or predict the result. Continue with independent work, or tell the user it is running.\n</task>`,
            }],
            details: { ...started, background: true },
          };
        } catch (error) {
          releaseTaskShortcut(request.parentSessionPath, shortcut);
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`Background subagent failed to start: ${message}`, { cause: error });
        }
      }

      const startedAt = Date.now();
      const update = (progress: TaskProgress) => {
        foreground.set(toolCallId, { startedAt, progress: copy(progress) });
        publishTasks();
        onUpdate?.({
          content: [{ type: "text", text: `${progress.status}: ${progress.currentTool ?? progress.outputPreview ?? "working"}` }],
          details: progress,
        });
      };
      if (params.task_id) activeTaskIds.add(params.task_id);
      try {
        const result = await runTaskWithShortcuts({ ...request, signal }, update);
        const output = truncateTaskOutput(result.output || "(no output)", result.sessionPath);
        return {
          content: [{ type: "text", text: `<task id="${result.taskId}" state="${result.status}">\n${output}\n</task>` }],
          details: { ...result, background: false },
        };
      } finally {
        if (params.task_id) activeTaskIds.delete(params.task_id);
        releaseTaskShortcut(request.parentSessionPath, shortcut);
        if (foreground.delete(toolCallId)) publishTasks();
      }
    },
  });

  pi.on("before_agent_start", (event, ctx) => {
    const found = discovery(ctx);
    const modeNote = ctx.mode === "tui" || ctx.mode === "rpc"
      ? ""
      : "\nIn this mode subagents run in the foreground: delegate waits for the result.";
    return { systemPrompt: `${event.systemPrompt}\n\nSubagents:\n${delegateDescription(found.agents)}${modeNote}` };
  });

  pi.on("session_start", (_event, ctx) => {
    ui = ctx.mode === "tui" ? ctx.ui : undefined;
    refreshWidget();
    // Finish what a reload, switch, exit or crash left in this session's ledger. Stored without starting
    // a turn: the model reads it with the next prompt, and the transcript shows it now.
    const { interrupted, undelivered } = reconcile(ctx.sessionManager.getEntries());
    for (const started of interrupted) {
      const ended = interruptedRecord(started);
      pi.appendEntry(LEDGER_TYPE, ended);
      deliver(ended, false);
    }
    for (const ended of undelivered) deliver(ended, false);
  });

  pi.on("session_shutdown", async () => {
    // Background subagents belong to this session and end with it, as in Claude Code.
    ui?.setWidget("delegate-background-tasks", undefined);
    ui = undefined;
    detailTui = undefined;
    const open = [...runs.values()];
    runs.clear();
    foreground.clear();
    publishTasks();
    for (const run of open) {
      run.controller.abort();
      if (!run.started) {
        run.rejectStart(new Error("Background subagent stopped during startup"));
        continue;
      }
      try {
        pi.appendEntry(LEDGER_TYPE, interruptedRecord(run.started));
      } catch {
        // The next session_start of this session reconciles the open run.
      }
    }
    // Let aborted children close their session files.
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.allSettled(open.map((run) => run.done)),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, SHUTDOWN_WAIT_MS); }),
    ]);
    clearTimeout(timer);
  });

  pi.registerCommand("agents", {
    description: "List subagents and discovery diagnostics",
    handler: async (_args, ctx) => {
      const found = discovery(ctx);
      const list = found.agents.map((agent) => {
        const model = agent.model ?? "parent";
        const thinking = agent.thinking ? `, thinking: ${agent.thinking}` : "";
        return `${agent.name} [${agent.source}] ${agent.description} (model: ${model}${thinking})`;
      }).join("\n") || "No subagents found.";
      ctx.ui.notify([list, ...found.diagnostics].join("\n"), found.diagnostics.length ? "warning" : "info");
    },
  });

  async function taskSiblings(ctx: ExtensionCommandContext) {
    const current = ctx.sessionManager.getSessionFile();
    if (!current) {
      ctx.ui.notify("Child-session navigation requires a saved parent session.", "warning");
      return;
    }
    const parent = ctx.sessionManager.getHeader()?.parentSession ?? current;
    return { current, siblings: childSessions(parent, await SessionManager.list(ctx.cwd)) };
  }

  async function chooseChild(ctx: ExtensionCommandContext) {
    const found = await taskSiblings(ctx);
    if (!found) return;
    if (found.siblings.length === 0) return ctx.ui.notify("No child task sessions found.", "info");
    if (!ctx.hasUI) return ctx.ui.notify("/tasks requires an interactive UI.", "warning");
    const labels = found.siblings.map(childSessionLabel);
    const selected = await ctx.ui.select("Task sessions", labels);
    const index = selected ? labels.indexOf(selected) : -1;
    if (index >= 0 && await confirmLeave(ctx)) await ctx.switchSession(found.siblings[index].path);
  }

  async function switchChild(ctx: ExtensionCommandContext, offset: number) {
    const found = await taskSiblings(ctx);
    if (!found) return;
    const target = siblingPath(found.current, found.siblings, offset);
    if (!target) return ctx.ui.notify("No child task sessions found.", "info");
    if (await confirmLeave(ctx)) await ctx.switchSession(target);
  }

  pi.registerCommand("tasks", { description: "Select a child task session", handler: (_args, ctx) => chooseChild(ctx) });
  pi.registerCommand("task-cancel", {
    description: "Cancel a running background subagent by task_id",
    handler: async (args, ctx) => {
      const taskId = args.trim();
      if (!taskId) {
        const running = [...runs.values()].map((run) => `${run.progress.taskId} ${run.progress.agent}: ${run.progress.title}`).join("\n");
        ctx.ui.notify(running || "No background subagents are running. Usage: /task-cancel <task_id>", running ? "info" : "warning");
        return;
      }
      const run = [...runs.values()].find((candidate) => candidate.progress.taskId === taskId);
      run?.controller.abort();
      ctx.ui.notify(
        run ? `Cancellation requested for ${taskId}.` : `No running background subagent: ${taskId}`,
        run ? "info" : "warning",
      );
    },
  });
  pi.registerCommand("task-next", { description: "Open the next sibling task session", handler: (_args, ctx) => switchChild(ctx, 1) });
  pi.registerCommand("task-prev", { description: "Open the previous sibling task session", handler: (_args, ctx) => switchChild(ctx, -1) });
  pi.registerCommand("task-parent", {
    description: "Return to the parent task session",
    handler: async (_args, ctx) => {
      const parent = ctx.sessionManager.getHeader()?.parentSession;
      if (!parent) return ctx.ui.notify("This is not a child task session.", "info");
      await ctx.switchSession(parent);
    },
  });
}
