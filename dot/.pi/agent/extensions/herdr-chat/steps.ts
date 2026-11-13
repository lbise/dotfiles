import { isAbsolute, relative } from "node:path";

export type StepKind = "look" | "run" | "edit" | "other";

export type Step = {
  id: string;
  kind: StepKind;
  name: string;
  label: string;
  startedAt: number;
  /** null while the tool runs. */
  endedAt: number | null;
  /** Absent while the tool runs. */
  ok?: boolean;
};

const KINDS: Record<string, StepKind> = {
  read: "look",
  grep: "look",
  find: "look",
  ls: "look",
  bash: "run",
  powershell: "run",
  codemode: "run",
  edit: "edit",
  write: "edit",
};

export function stepKind(toolName: string): StepKind {
  // Web fetch and search tools come from extensions and MCP servers under varying names.
  if (Object.hasOwn(KINDS, toolName)) return KINDS[toolName];
  return /fetch|search/i.test(toolName) ? "look" : "other";
}

/** Argument that names what a call is about, most telling first. */
const LABEL_KEYS = ["command", "pattern", "path", "file_path", "url", "query", "title", "question", "code"];
const MAX_LABEL = 200;

/** One short line for a tool call: its path (relative to cwd when inside it), pattern or command. */
export function stepLabel(args: unknown, cwd: string): string {
  if (!args || typeof args !== "object") return "";
  const input = args as Record<string, unknown>;
  const key = LABEL_KEYS.find((k) => typeof input[k] === "string" && input[k]);
  if (!key) return "";

  let text = input[key] as string;
  if ((key === "path" || key === "file_path") && isAbsolute(text)) {
    const inside = relative(cwd, text);
    if (inside && !inside.startsWith("..") && !isAbsolute(inside)) text = inside;
  }
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_LABEL);
}
