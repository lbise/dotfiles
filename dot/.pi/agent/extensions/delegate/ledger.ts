// Durable record of background subagents, kept in the parent session file.
// Invariant: every `started` gets exactly one `ended`, and every `ended` exactly one
// `delegate-completion` message. `reconcile` finds what a crash, reload or switch left undone.

import type { TaskStatus } from "./runner.ts";

export const LEDGER_TYPE = "delegate-task";
export const COMPLETION_TYPE = "delegate-completion";

export type StartedRecord = {
  runId: string;
  phase: "started";
  taskId: string;
  sessionPath?: string;
  agent: string;
  title: string;
};

export type EndedRecord = Omit<StartedRecord, "phase"> & {
  phase: "ended";
  status: TaskStatus;
  output?: string;
  error?: string;
  model?: string;
  turns?: number;
  tokens?: number;
  cost?: number;
};

type Entry = { type: string; customType?: string; data?: unknown; details?: unknown };

function record(entry: Entry): StartedRecord | EndedRecord | undefined {
  if (entry.type !== "custom" || entry.customType !== LEDGER_TYPE) return undefined;
  const data = entry.data as Partial<StartedRecord | EndedRecord> | undefined;
  if (!data || typeof data.runId !== "string" || (data.phase !== "started" && data.phase !== "ended")) return undefined;
  return data as StartedRecord | EndedRecord;
}

function deliveredRunId(entry: Entry): string | undefined {
  if (entry.type !== "custom_message" || entry.customType !== COMPLETION_TYPE) return undefined;
  const runId = (entry.details as { runId?: unknown } | undefined)?.runId;
  return typeof runId === "string" ? runId : undefined;
}

/** Ledger rows a new extension instance must finish: runs that never ended, and endings never delivered. */
export function reconcile(entries: readonly Entry[]): { interrupted: StartedRecord[]; undelivered: EndedRecord[] } {
  const started = new Map<string, StartedRecord>();
  const ended = new Map<string, EndedRecord>();
  const delivered = new Set<string>();
  for (const entry of entries) {
    const row = record(entry);
    if (row?.phase === "started" && !started.has(row.runId)) started.set(row.runId, row);
    if (row?.phase === "ended" && !ended.has(row.runId)) ended.set(row.runId, row);
    const runId = deliveredRunId(entry);
    if (runId) delivered.add(runId);
  }
  return {
    interrupted: [...started.values()].filter((row) => !ended.has(row.runId)),
    undelivered: [...ended.values()].filter((row) => !delivered.has(row.runId)),
  };
}

export function interruptedRecord(started: StartedRecord): EndedRecord {
  return {
    ...started,
    phase: "ended",
    status: "interrupted",
    error: "Interrupted before it finished (reload, session switch, exit or crash).",
  };
}

/** What the parent model reads when a run ends. */
export function completionText(ended: EndedRecord, output: string): string {
  const resume = ended.status === "interrupted"
    ? `\nIts session is saved. If the work is still needed, continue it with delegate task_id "${ended.taskId}".`
    : "";
  return `<task id="${ended.taskId}" state="${ended.status}" background="true">\n${output}${resume}\n</task>`;
}
