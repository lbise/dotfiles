import type { AgentMessage, ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  type ModelRegistry,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

import type { TaskAgent } from "./agents.ts";
import { resolveResumeSession, taskAgentName, taskSessionName } from "./sessions.ts";

const MAX_ACTIVITY = 8;

export type TaskStatus = "queued" | "running" | "completed" | "failed" | "aborted";
export type TaskProgress = {
  status: TaskStatus;
  taskId: string;
  sessionPath?: string;
  agent: string;
  title: string;
  shortcut?: string;
  model?: string;
  thinking?: ThinkingLevel;
  currentTool?: string;
  activity: string[];
  outputPreview?: string;
  turns?: number;
  tokens?: number;
  cost?: number;
  error?: string;
};

export type TaskResult = TaskProgress & { output: string };

export type RunTaskRequest = {
  agent: TaskAgent;
  title: string;
  prompt: string;
  taskId?: string;
  shortcut?: string;
  cwd: string;
  parentSessionPath?: string;
  parentTools: string[];
  parentModel: Model<any> | undefined;
  parentThinking?: ThinkingLevel;
  modelRegistry: Pick<ModelRegistry, "find">;
  projectTrusted: boolean;
  signal?: AbortSignal;
};

function lastAssistant(messages: readonly AgentMessage[]): Extract<AgentMessage, { role: "assistant" }> | undefined {
  return [...messages].reverse().find(
    (message): message is Extract<AgentMessage, { role: "assistant" }> => message.role === "assistant",
  );
}

function finalText(messages: readonly AgentMessage[]): string {
  for (const message of [...messages].reverse()) {
    if (message.role !== "assistant") continue;
    const text = message.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim();
    if (text) return text;
  }
  return "";
}

function appendActivity(activity: string[], value: string): void {
  activity.push(value);
  if (activity.length > MAX_ACTIVITY) activity.splice(0, activity.length - MAX_ACTIVITY);
}

function resolveModel(request: RunTaskRequest): ReturnType<ModelRegistry["find"]> {
  if (!request.agent.model) return request.parentModel;
  const [provider, ...parts] = request.agent.model.split("/");
  return provider && parts.length ? request.modelRegistry.find(provider, parts.join("/")) : undefined;
}

async function childSession(request: RunTaskRequest): Promise<SessionManager> {
  if (request.taskId) {
    const match = resolveResumeSession(
      request.taskId,
      request.parentSessionPath,
      await SessionManager.list(request.cwd),
    );
    const manager = SessionManager.open(match.path);
    const originalAgent = taskAgentName(manager.getEntries());
    if (!originalAgent) throw new Error("task_id was not created by this delegate extension");
    if (originalAgent !== request.agent.name) {
      throw new Error(`task_id belongs to ${originalAgent}, not ${request.agent.name}`);
    }
    return manager;
  }

  const manager = request.parentSessionPath
    ? SessionManager.open(request.parentSessionPath)
    : SessionManager.inMemory(request.cwd);
  if (request.parentSessionPath) manager.newSession({ parentSession: request.parentSessionPath });
  manager.appendCustomEntry("pi-delegate", { agent: request.agent.name });
  manager.appendSessionInfo(taskSessionName(request.agent.name, request.title));
  return manager;
}

export async function runTask(
  request: RunTaskRequest,
  onProgress?: (progress: TaskProgress) => void,
  onStarted?: (progress: TaskProgress) => void,
): Promise<TaskResult> {
  const model = resolveModel(request);
  if (!model) throw new Error(`No usable model for agent ${request.agent.name}`);
  const manager = await childSession(request);
  const taskId = manager.getSessionId();
  const sessionPath = manager.getSessionFile();
  const activity: string[] = [];
  const state: TaskProgress = {
    status: "queued", taskId, sessionPath, agent: request.agent.name, title: request.title,
    shortcut: request.shortcut, model: `${model.provider}/${model.id}`, activity,
  };
  const emit = () => onProgress?.({ ...state, activity: [...activity] });
  const agentDir = process.env.PI_CODING_AGENT_DIR ?? getAgentDir();
  const settingsManager = SettingsManager.create(request.cwd, agentDir, { projectTrusted: request.projectTrusted });
  const loader = new DefaultResourceLoader({
    cwd: request.cwd,
    agentDir,
    settingsManager,
    noExtensions: true,
    appendSystemPrompt: [
      request.agent.prompt,
      `You are the ${request.agent.name} child agent. Complete the delegated task and end with a concise report. Do not delegate work or invoke subagents.`,
    ],
  });
  await loader.reload();
  const { session } = await createAgentSession({
    cwd: request.cwd,
    model,
    thinkingLevel: (request.agent.thinking as ThinkingLevel | undefined) ??
      (request.agent.model ? undefined : request.parentThinking),
    tools: request.parentTools,
    resourceLoader: loader,
    sessionManager: manager,
    settingsManager,
  });
  state.thinking = session.thinkingLevel;
  const unsubscribe = session.subscribe((event) => {
    if (event.type === "tool_execution_start") {
      state.currentTool = event.toolName;
      appendActivity(activity, `started ${event.toolName}`);
      emit();
    }
    if (event.type === "tool_execution_end") {
      appendActivity(activity, `${event.isError ? "failed" : "finished"} ${event.toolName}`);
      state.currentTool = undefined;
      emit();
    }
    if (event.type === "message_end" && event.message?.role === "assistant") {
      state.outputPreview = finalText([event.message]).slice(0, 500);
      state.turns = (state.turns ?? 0) + 1;
      state.tokens = (state.tokens ?? 0) + (event.message.usage?.totalTokens ?? 0);
      state.cost = (state.cost ?? 0) + (event.message.usage?.cost?.total ?? 0);
      emit();
    }
  });
  const abort = () => void session.abort().catch(() => {});
  request.signal?.addEventListener("abort", abort, { once: true });
  try {
    if (request.signal?.aborted) throw new Error("Task aborted");
    state.status = "running";
    emit();
    onStarted?.({ ...state, activity: [...activity] });
    const previousMessageCount = session.messages.length;
    await session.prompt(request.prompt);
    const currentMessages = session.messages.slice(previousMessageCount);
    const terminal = lastAssistant(currentMessages);
    if (request.signal?.aborted || terminal?.stopReason === "aborted") throw new Error("Task aborted");
    if (terminal?.stopReason === "error") throw new Error(terminal.errorMessage || "Child agent failed");
    state.status = "completed";
    const output = finalText(currentMessages);
    state.outputPreview = output.slice(0, 500);
    emit();
    return { ...state, activity: [...activity], output };
  } catch (error) {
    state.status = request.signal?.aborted ? "aborted" : "failed";
    state.error = error instanceof Error ? error.message : String(error);
    emit();
    throw error;
  } finally {
    request.signal?.removeEventListener("abort", abort);
    unsubscribe();
    session.dispose();
  }
}
