// What a tool call is, in the chat's terms: its kind (which cell colour), its
// one-line label, and the lines it adds to or removes from a file.
// The kinds and the label follow docs/herdr-chat.md and the Pi extension's steps.ts
// (same table, same order of arguments), so a step from state.json and the same
// step from the session file read alike.

/** @typedef {"look"|"run"|"edit"|"other"} StepKind */

const LABEL_MAX = 200;
/** @type {Record<string, StepKind>} */
const KINDS = { read: "look", grep: "look", find: "look", ls: "look", bash: "run", powershell: "run", codemode: "run", edit: "edit", write: "edit" };
// The argument that names what a call is about, most telling first. The extension
// stops at "code"; the rest only replaces a bare tool name.
const LABEL_KEYS = ["command", "pattern", "path", "file_path", "url", "query", "title", "question", "code", "description", "action", "prompt", "task"];

/**
 * Cuts text to `max` characters, ending in an ellipsis when something was cut.
 * @param {string} text
 * @param {number} max
 */
export function clip(text, max) {
  if (text.length <= max) return text;
  let end = max - 1;
  const code = text.charCodeAt(end - 1);
  if (code >= 0xd800 && code < 0xdc00) end--; // do not keep half of a surrogate pair
  return text.slice(0, end) + "…";
}

/**
 * @param {string} name The tool's name.
 * @returns {StepKind}
 */
export function stepKind(name) {
  const tool = String(name);
  if (Object.prototype.hasOwnProperty.call(KINDS, tool)) return KINDS[tool];
  // Web fetch and search tools come from extensions under varying names.
  return /fetch|search/i.test(tool) ? "look" : "other";
}

/**
 * A path inside `cwd` as relative to it; any other path as it is.
 * @param {string} path
 * @param {string|null} [cwd]
 */
export function shortPath(path, cwd) {
  if (!cwd) return path;
  const root = cwd.endsWith("/") ? cwd : cwd + "/";
  return path.length > root.length && path.startsWith(root) ? path.slice(root.length) : path;
}

/**
 * One short line for a tool call: the command, pattern or path (relative to
 * `cwd` when inside it), else the tool's name.
 * @param {string} name
 * @param {any} args The call's arguments.
 * @param {string|null} [cwd]
 */
export function stepLabel(name, args, cwd) {
  const given = args && typeof args === "object" ? args : {};
  const key = LABEL_KEYS.find((k) => typeof given[k] === "string" && given[k]);
  if (!key) return String(name);
  const value = key === "path" || key === "file_path" ? shortPath(given[key], cwd) : given[key];
  // Only the start can show: do not scan a whole heredoc.
  const line = value.slice(0, LABEL_MAX * 4).replace(/\s+/g, " ").trim();
  return line ? clip(line, LABEL_MAX) : String(name);
}

/** @param {unknown} text */
function lines(text) {
  if (typeof text !== "string" || text === "") return [];
  const all = text.split("\n");
  if (all[all.length - 1] === "") all.pop();
  return all;
}

// shortcut: counts what is left after dropping the lines both texts start and end
// with, not a minimal diff; replace with an LCS if the counts must match git's.
/**
 * @param {unknown} oldText
 * @param {unknown} newText
 */
function replaced(oldText, newText) {
  const before = lines(oldText);
  const after = lines(newText);
  let head = 0;
  while (head < before.length && head < after.length && before[head] === after[head]) head++;
  let tail = 0;
  while (
    tail < before.length - head &&
    tail < after.length - head &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) {
    tail++;
  }
  return { added: after.length - head - tail, removed: before.length - head - tail };
}

/**
 * What an edit or write call changes, from its arguments alone. A write counts
 * every line as added: what it replaced is not in the arguments.
 * @param {string} name
 * @param {any} args The call's arguments.
 * @param {string|null} [cwd] The path is given relative to it when inside it.
 * @returns {{ path: string, added: number, removed: number }|null}
 */
export function fileChange(name, args, cwd) {
  if ((name !== "edit" && name !== "write") || !args || typeof args.path !== "string") return null;
  const path = shortPath(args.path, cwd);
  if (name === "write") return { path, added: lines(args.content).length, removed: 0 };
  const edits = Array.isArray(args.edits) ? args.edits : [args];
  const change = { path, added: 0, removed: 0 };
  for (const edit of edits) {
    if (!edit) continue;
    const delta = replaced(edit.oldText, edit.newText);
    change.added += delta.added;
    change.removed += delta.removed;
  }
  return change;
}
