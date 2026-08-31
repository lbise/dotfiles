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
import { completionDeliveryOptions, type ParentActivity } from "./delivery.ts";
import {
  BackgroundTaskPool,
  type BackgroundTaskEvent,
  type BackgroundTaskSnapshot,
} from "./background.ts";
import { DelegateParameters, DelegateResultParameters } from "./parameters.ts";
import { childToolAllowlist } from "./policy.ts";
import {
  BackgroundTaskDetailOverlay,
  BackgroundTasksWidget,
  createDelegateRenderer,
  createDelegateResultRenderer,
  renderDelegateCompletion,
} from "./render.ts";
import { runTask, type RunTaskRequest, type TaskProgress } from "./runner.ts";
import { loadDelegateConfiguration } from "./settings.ts";
import { childSessionLabel, childSessions, siblingPath } from "./sessions.ts";

const extensionDir = dirname(fileURLToPath(import.meta.url));
const packagedDir = join(extensionDir, "agents");
const projectConfirmations = new Map<string, Set<string>>();
const MAX_BACKGROUND_TASKS = 8;
let sharedBackgroundTasks: BackgroundTaskPool | undefined;
let backgroundParent: ParentActivity | undefined;
let backgroundUi: ExtensionContext["ui"] | undefined;
let backgroundDetailTui: { requestRender(): void } | undefined;
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

function userAgentsDir(): string {
  return join(process.env.PI_CODING_AGENT_DIR ?? join(process.env.HOME ?? "", ".pi", "agent"), "agents");
}

function discovery(ctx: { cwd: string; isProjectTrusted(): boolean }) {
  const projectTrusted = ctx.isProjectTrusted();
  const found = discoverAgents({ packagedDir, userDir: userAgentsDir(), cwd: ctx.cwd, projectTrusted });
  return configureAgents(found, loadDelegateConfiguration(ctx.cwd, projectTrusted));
}

function delegateDescription(agents: TaskAgent[]): string {
  const choices = agents.filter((agent) => !agent.hidden).map((agent) => `- ${agent.name}: ${agent.description}`).join("\n") || "- none";
  return [
    "Launch a named child agent in its own isolated context window.",
    "A fresh child receives its prompt and normal project context, but not the parent transcript. A resumed child also retains only its own prior history. Only final results return to the parent.",
    "Use delegation to keep subtask exploration and tool output out of the parent context.",
    "The title is human-facing. The prompt is the child's complete instruction and must include the goal, relevant context and constraints, and expected result.",
    "Choose subagent_type from the names below. User and trusted-project agent definitions may extend or override the packaged general and explore agents.",
    "Use separate delegate calls for independent work. Do not duplicate delegated work. The child cannot delegate further.",
    "Delegation defaults to foreground and waits for the child result. Omit mode for normal delegation. Set mode to background only when useful parent work can continue without the result.",
    "A background call returns only a task_id, not the child result. If it finishes while the parent is running, its result is delivered before the next model call. If the parent has settled, the result starts a follow-up turn. Inspect the <task> body and use or summarize it before claiming the delegated work is complete.",
    "Do not poll background tasks in a loop. Use delegate_result wait only when a task now blocks progress and its completion message has not arrived; use poll only for a one-off status check.",
    "Available subagents:", choices,
  ].join("\n");
}

function truncateTaskOutput(output: string, progress: TaskProgress): string {
  const truncation = truncateHead(output, {
    maxBytes: DEFAULT_MAX_BYTES - 1_024,
    maxLines: DEFAULT_MAX_LINES - 10,
  });
  if (!truncation.truncated) return truncation.content;
  const location = progress.sessionPath ? ` Full output remains in child session ${progress.sessionPath}.` : "";
  return `${truncation.content}\n\n[Output truncated: ${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}.${location}]`;
}

function settledTaskText(snapshot: BackgroundTaskSnapshot): string {
  const state = snapshot.result?.status ?? snapshot.progress.status;
  const output = truncateTaskOutput(
    snapshot.result?.output || snapshot.error?.message || (snapshot.settled ? "(no output)" : "Task is still running."),
    snapshot.progress,
  );
  return [
    `<task id="${snapshot.progress.taskId}" state="${state}" background="true">`,
    output,
    "</task>",
  ].join("\n");
}

function backgroundCompletionText(event: BackgroundTaskEvent): string {
  const state = event.result?.status ?? event.progress.status;
  const output = truncateTaskOutput(
    event.result?.output || event.error?.message || "(no output)",
    event.progress,
  );
  return [
    `<task id="${event.progress.taskId}" state="${state}" background="true">`,
    output,
    "</task>",
  ].join("\n");
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

export default function delegateExtension(pi: ExtensionAPI) {
  const activeTaskIds = new Set<string>();
  const taskShortcuts = new Map<string, Map<TaskShortcut, TaskShortcutEntry>>();
  const delegateRenderer = createDelegateRenderer();
  const delegateResultRenderer = createDelegateResultRenderer();

  function refreshBackgroundWidget(): void {
    const tasks = backgroundTasks.list();
    for (const task of tasks) delegateRenderer.updateBackgroundTask(task);
    if (backgroundUi) {
      backgroundUi.setWidget(
        "delegate-background-tasks",
        tasks.length
          ? (tui, theme) => new BackgroundTasksWidget(tasks, theme, () => tui.requestRender())
          : undefined,
        { placement: "aboveEditor" },
      );
    }
    try { backgroundDetailTui?.requestRender(); } catch {}
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
    entry.progress = { ...progress, activity: [...progress.activity] };
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
      if (entry.taskId) {
        const background = backgroundTasks.lookup(entry.taskId);
        if (background) return background;
      }
      if (!entry.progress) return undefined;
      return {
        progress: entry.progress,
        settled: !["queued", "running"].includes(entry.progress.status),
      };
    };
    await ctx.ui.custom<void>((tui, theme, _keybindings, done) => {
      backgroundDetailTui = tui;
      return new BackgroundTaskDetailOverlay(key, theme, snapshot, done, () => {
        if (backgroundDetailTui === tui) backgroundDetailTui = undefined;
      });
    }, {
      overlay: true,
      overlayOptions: { anchor: "center", width: "80%", maxHeight: "80%", minWidth: 60 },
    });
    backgroundDetailTui = undefined;
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

  const backgroundCallbacks = {
    onChange: refreshBackgroundWidget,
    onSettled(event: BackgroundTaskEvent) {
      activeTaskIds.delete(event.progress.taskId);
      delegateRenderer.updateBackgroundTask(event.progress, event.error);
      pi.sendMessage(
        {
          customType: "delegate-completion",
          content: backgroundCompletionText(event),
          display: true,
          details: {
            ...event.progress,
            background: true,
            output: event.result?.output,
            error: event.error?.message.slice(0, 500),
          },
        },
        completionDeliveryOptions(backgroundParent),
      );
    },
  };
  const backgroundTasks = sharedBackgroundTasks ?? new BackgroundTaskPool({
    maxConcurrent: MAX_BACKGROUND_TASKS,
    runTask: runTaskWithShortcuts,
    ...backgroundCallbacks,
  });
  sharedBackgroundTasks = backgroundTasks;

  pi.registerMessageRenderer("delegate-completion", renderDelegateCompletion);

  pi.registerTool({
    name: "delegate",
    label: "Delegate",
    description: "Run a named child agent in an isolated context window so subtask reasoning and tool output do not pollute the parent context. A fresh child receives its prompt plus normal project context; a resumed child also retains its own history. Neither receives the parent transcript. Delegation waits for the child by default. Set mode to background only while independent work remains, then consume the delivered result before claiming the task is complete.",
    promptSnippet: "Delegate bounded work to a named child agent with an isolated context window",
    promptGuidelines: [
      "After calling delegate, do not duplicate the child's assigned work in the parent.",
      "Omit delegate mode for normal delegation; it defaults to foreground and waits for the child result.",
      "Set delegate mode background only when useful parent work can continue independently of the result.",
      "When a delegate completion message arrives, inspect its <task> body and use or summarize the child result before claiming the delegated work is complete.",
    ],
    renderShell: "self",
    parameters: DelegateParameters,
    renderCall: delegateRenderer.renderCall,
    renderResult: delegateRenderer.renderResult,
    async execute(_id, params, signal, onUpdate, ctx) {
      const found = discovery(ctx);
      const agent = found.agents.find((candidate) => candidate.name === params.subagent_type);
      if (!agent) {
        throw new Error(`Unknown subagent ${params.subagent_type}.\n${delegateDescription(found.agents)}`);
      }
      if (!(await confirmProjectAgent(agent, ctx))) {
        throw new Error("Project agent execution was not approved.");
      }
      if (params.mode === "background" && ctx.mode !== "tui" && ctx.mode !== "rpc") {
        throw new Error("Background delegation requires TUI or RPC mode.");
      }
      if (params.task_id && activeTaskIds.has(params.task_id)) {
        throw new Error(`task_id is already running: ${params.task_id}`);
      }
      const parentTools = childToolAllowlist(pi.getActiveTools().filter((tool) => tool !== "delegate"), agent.tools);
      if (agent.tools && parentTools.length === 0) {
        throw new Error(`No permitted tools remain for ${agent.name}.`);
      }
      if (params.task_id) activeTaskIds.add(params.task_id);
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

      if (params.mode === "background") {
        backgroundParent = ctx;
        if (ctx.mode === "tui") backgroundUi = ctx.ui;
        try {
          // Background work is detached immediately. A parent-session abort must not cancel startup.
          const started = await backgroundTasks.start(request);
          if (backgroundTasks.has(started.taskId)) activeTaskIds.add(started.taskId);
          return {
            content: [{
              type: "text",
              text: `<task id="${started.taskId}" state="running" background="true">\nBackground task started. This is only a task_id, not the child result. Continue with independent work. A completion message will deliver the result; use delegate_result with mode wait only if this task later blocks progress before that message arrives.\n</task>`,
            }],
            details: { ...started, background: true },
          };
        } catch (error) {
          if (params.task_id) activeTaskIds.delete(params.task_id);
          releaseTaskShortcut(request.parentSessionPath, shortcut);
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`Background delegation failed to start: ${message}`, { cause: error });
        }
      }

      const update = (progress: TaskProgress) => {
        onUpdate?.({
          content: [{ type: "text", text: `${progress.status}: ${progress.currentTool ?? progress.outputPreview ?? "working"}` }],
          details: progress,
        });
      };
      try {
        const result = await runTaskWithShortcuts({ ...request, signal }, update);
        const output = truncateTaskOutput(result.output || "(no output)", result);
        return {
          content: [{ type: "text", text: `<task id="${result.taskId}" state="${result.status}">\n${output}\n</task>` }],
          details: { ...result, background: false },
        };
      } finally {
        if (params.task_id) activeTaskIds.delete(params.task_id);
        releaseTaskShortcut(request.parentSessionPath, shortcut);
      }
    },
  });

  pi.registerTool({
    name: "delegate_result",
    label: "Delegate Result",
    description: "Get the status or final result of a background delegate task in the current parent session. Poll performs one immediate status check; wait blocks until the task settles or the timeout expires. Do not poll in a loop.",
    promptSnippet: "Poll or wait for a background delegated task result",
    promptGuidelines: [
      "Do not call delegate_result poll in a loop; use mode poll only for a one-off status check.",
      "Use delegate_result mode wait as a barrier when a known background task now blocks the next action and its completion message has not arrived.",
      "Read and use the <task> result returned by delegate_result before continuing.",
    ],
    renderShell: "self",
    parameters: DelegateResultParameters,
    renderCall: delegateResultRenderer.renderCall,
    renderResult: delegateResultRenderer.renderResult,
    async execute(_id, params, signal) {
      const snapshot = params.mode === "wait"
        ? await backgroundTasks.waitFor(params.task_id, (params.timeout_seconds ?? 30) * 1_000, signal)
        : backgroundTasks.lookup(params.task_id);
      if (!snapshot) {
        throw new Error(`Unknown background task_id in this parent session: ${params.task_id}`);
      }
      return {
        content: [{ type: "text", text: settledTaskText(snapshot) }],
        details: {
          ...snapshot.progress,
          background: true,
          settled: snapshot.settled,
          error: snapshot.error?.message.slice(0, 500),
        },
      };
    },
  });

  pi.on("before_agent_start", (event, ctx) => {
    const found = discovery(ctx);
    const modeNote = ctx.mode === "tui" || ctx.mode === "rpc"
      ? ""
      : "\nBackground delegation is unavailable in this mode; omit mode to use foreground.";
    return { systemPrompt: `${event.systemPrompt}\n\nSubagents available to delegate:\n${delegateDescription(found.agents)}${modeNote}` };
  });

  pi.on("session_start", (_event, ctx) => {
    // Rebind after the replacement session is ready. setCallbacks replays any
    // completion that settled while the previous extension instance was down.
    backgroundParent = ctx;
    backgroundTasks.setCallbacks({ ...backgroundCallbacks, runTask: runTaskWithShortcuts });
    if (ctx.mode !== "tui") return;
    backgroundUi = ctx.ui;
    refreshBackgroundWidget();
  });

  pi.on("session_shutdown", async (event) => {
    backgroundUi?.setWidget("delegate-background-tasks", undefined);
    backgroundParent = undefined;
    backgroundUi = undefined;
    backgroundDetailTui = undefined;

    if (event.reason === "quit" || event.reason === "reload") {
      await backgroundTasks.shutdown();
      if (sharedBackgroundTasks === backgroundTasks) sharedBackgroundTasks = undefined;
      return;
    }

    // Session replacement invalidates this extension instance, but detached background work continues.
    // Queue completions until the replacement instance binds fresh delivery callbacks.
    backgroundTasks.suspendCallbacks();
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
    if (index >= 0) await ctx.switchSession(found.siblings[index].path);
  }

  async function switchChild(ctx: ExtensionCommandContext, offset: number) {
    const found = await taskSiblings(ctx);
    if (!found) return;
    const target = siblingPath(found.current, found.siblings, offset);
    if (!target) return ctx.ui.notify("No child task sessions found.", "info");
    await ctx.switchSession(target);
  }

  pi.registerCommand("tasks", { description: "Select a child task session", handler: (_args, ctx) => chooseChild(ctx) });
  pi.registerCommand("task-cancel", {
    description: "Cancel a running background task by task_id",
    handler: async (args, ctx) => {
      const taskId = args.trim();
      if (!taskId) {
        const running = backgroundTasks.list().map((task) => `${task.taskId} ${task.agent}: ${task.title}`).join("\n");
        ctx.ui.notify(running || "No background tasks are running. Usage: /task-cancel <task_id>", running ? "info" : "warning");
        return;
      }
      const cancelled = backgroundTasks.cancel(taskId);
      ctx.ui.notify(
        cancelled ? `Cancellation requested for ${taskId}.` : `No running background task: ${taskId}`,
        cancelled ? "info" : "warning",
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
