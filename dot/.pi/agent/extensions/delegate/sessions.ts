export type ChildSession = {
  id?: string;
  path: string;
  parentSessionPath?: string;
  created: Date;
  name?: string;
  firstMessage?: string;
};

type TaskEntry = {
  type: string;
  customType?: string;
  data?: unknown;
};

export function childSessions(parentPath: string, sessions: readonly ChildSession[]): ChildSession[] {
  return sessions
    .filter((session) => session.parentSessionPath === parentPath)
    .toSorted((a, b) => a.created.getTime() - b.created.getTime());
}

export function siblingPath(currentPath: string, siblings: readonly ChildSession[], offset: number): string | undefined {
  if (siblings.length === 0) return undefined;
  const index = siblings.findIndex((session) => session.path === currentPath);
  if (index < 0) return siblings[0]?.path;
  return siblings[(index + offset + siblings.length) % siblings.length]?.path;
}

export function childSessionLabel(session: ChildSession): string {
  const title = session.name || session.firstMessage?.replace(/\s+/g, " ").trim() || "Task";
  const preview = title.length > 70 ? `${title.slice(0, 67)}...` : title;
  return session.id ? `${preview} [${session.id.slice(0, 8)}]` : preview;
}

export function resolveResumeSession(
  taskId: string,
  parentPath: string | undefined,
  sessions: readonly ChildSession[],
): ChildSession {
  if (!parentPath) throw new Error("Resuming a task requires a persisted parent session");
  const match = sessions.find((session) => session.id === taskId);
  if (!match) throw new Error(`Unknown task_id: ${taskId}`);
  if (match.parentSessionPath !== parentPath) {
    throw new Error("task_id does not belong to the current parent session");
  }
  return match;
}

export function taskAgentName(entries: readonly TaskEntry[]): string | undefined {
  for (const entry of entries) {
    if (entry.type !== "custom" || !["pi-delegate", "pi-task"].includes(entry.customType ?? "")) continue;
    if (!entry.data || typeof entry.data !== "object") return undefined;
    const agent = (entry.data as { agent?: unknown }).agent;
    return typeof agent === "string" ? agent : undefined;
  }
  return undefined;
}

export function taskSessionName(agent: string, title: string): string {
  const label = agent.length > 0 ? `${agent[0]?.toUpperCase()}${agent.slice(1)}` : "Task";
  return `${label}: ${title}`;
}
