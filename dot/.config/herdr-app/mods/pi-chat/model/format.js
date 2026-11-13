// Figures for the status bar and the turn headers.

export const CONTEXT_CELLS = 40;
export const USAGE_CELLS = 10;

/** @param {number} value */
function short(value) {
  return (value < 9.95 ? value.toFixed(1) : String(Math.round(value))).replace(/\.0$/, "");
}

/**
 * 950, 1.5k, 113k, 1M, 1.2M.
 * @param {number} count
 */
export function formatTokens(count) {
  if (!Number.isFinite(count) || count < 0) return "";
  if (count < 1000) return String(Math.round(count));
  if (count < 999500) return `${short(count / 1000)}k`;
  return `${short(count / 1e6)}M`;
}

/**
 * 450ms, 18s, 2m 14s, 1h 5m.
 * @param {number} ms
 */
export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1000) return `${Math.floor(ms)}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/**
 * $1.42; "" when the cost is unknown.
 * @param {number|null} usd
 */
export function formatCost(usd) {
  if (!Number.isFinite(usd) || usd < 0) return "";
  if (usd > 0 && usd < 0.005) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

/**
 * How many of `cells` a fraction fills: anything above zero shows as one cell.
 * @param {number} fraction
 * @param {number} cells
 */
function filledCells(fraction, cells) {
  if (!(fraction > 0)) return 0;
  return Math.min(cells, Math.max(1, Math.round(fraction * cells)));
}

/**
 * The context window as 40 cells, each 1/40 of it.
 * state.json gives only a total, so every filled cell is "used"; when a
 * breakdown is passed as `parts`, the cells take its categories in order.
 * @param {{ tokens: number, window: number|null, parts?: Array<{ category: string, tokens: number }> }|null} context
 * @returns {Array<string|null>} 40 entries: a category for a filled cell, null for an empty one. All null when the window is unknown.
 */
export function contextCells(context) {
  const cells = new Array(CONTEXT_CELLS).fill(null);
  if (!context || !(context.window > 0)) return cells;
  const filled = filledCells(context.tokens / context.window, CONTEXT_CELLS);
  let at = 0;
  let tokens = 0;
  for (const part of Array.isArray(context.parts) ? context.parts : []) {
    tokens += part.tokens;
    const upTo = Math.min(filled, filledCells(tokens / context.window, CONTEXT_CELLS));
    while (at < upTo) cells[at++] = part.category;
  }
  while (at < filled) cells[at++] = "used";
  return cells;
}

/**
 * One usage text of the Pi footer ("5h 38%", "wk ████░░░░ 53.9% 14.8k/27.5k").
 * @param {string} text
 * @returns {{ label: string, percent: number|null, detail: string, cells: boolean[] }}
 *   `cells` has 10 entries, true for each tenth used; all false without a percentage.
 */
export function usageCells(text) {
  // Bars and icon-font glyphs are the terminal's drawing of what the cells show.
  const clean = String(text == null ? "" : text)
    .replace(/[\u2500-\u259f\ue000-\uf8ff]|[\udb80-\udbff][\udc00-\udfff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const match = /(\d+(?:\.\d+)?)\s*%/.exec(clean);
  const cells = new Array(USAGE_CELLS).fill(false);
  if (!match) return { label: clean, percent: null, detail: "", cells };
  const percent = Number(match[1]);
  const before = clean.slice(0, match.index).trim();
  const after = clean.slice(match.index + match[0].length).trim();
  cells.fill(true, 0, filledCells(percent / 100, USAGE_CELLS));
  return { label: before || after, percent, detail: before ? after : "", cells };
}

/**
 * How long ago: "now", "5m ago", "3h ago", "2d ago", "3w ago", "4mo ago", "2y ago".
 * @param {number|null} ms Epoch ms.
 * @param {number} now Epoch ms.
 */
export function formatAge(ms, now) {
  if (!Number.isFinite(ms)) return "";
  const minutes = Math.floor(Math.max(0, now - ms) / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

const alarm = (tone) => (tone === "warning" || tone === "error" ? tone : null);

/**
 * @typedef {object} UsageGroup One usage figure of the status bar.
 * @property {string} label What it measures ("5h", "Week", "Prompt"), or "".
 * @property {number|null} percent Of the limit used; null for a figure without a limit.
 * @property {boolean[]} cells 10 entries, as usageCells gives them.
 * @property {string} value The figure, when there is no percentage ("~0.1cr").
 * @property {string} resets Time left until the limit resets ("2h 10m"), or "".
 * @property {string[]} words What follows the figure: used/limit, or what an older usage extension wrote.
 * @property {"warning"|"error"|null} tone The figure warns: drawn in amber or rose.
 * @property {string} note After the words: Copilot's month-end projection, an overage ("").
 * @property {"warning"|"error"|null} noteTone
 */

/**
 * The footer's usage entries (state.usage) as the status bar's groups. Entries
 * with `label`, `percent` and `resets` are taken as they are; without them the
 * figures come out of the text, and a text without a percentage joins the
 * limit before it.
 * @param {Array<{ key?: string, text?: string, label?: string, percent?: number, resets?: string }>} entries
 * @returns {UsageGroup[]}
 */
export function usageGroups(entries) {
  const groups = [];
  let last = null;
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || typeof entry !== "object") continue;
    const label = typeof entry.label === "string" ? entry.label : null;
    const resets = typeof entry.resets === "string" ? entry.resets : "";
    if (Number.isFinite(entry.percent)) {
      const words = typeof entry.detail === "string" && entry.detail ? [entry.detail] : [];
      const note = typeof entry.note === "string" ? entry.note : "";
      last = { label: label || "", percent: entry.percent, cells: usageCells(`${entry.percent}%`).cells, value: "", resets, words, tone: alarm(entry.tone), note, noteTone: alarm(entry.noteTone) };
      groups.push(last);
      continue;
    }
    const usage = usageCells(entry.text);
    if (usage.percent !== null) {
      last = { label: usage.label, percent: usage.percent, cells: usage.cells, value: "", resets: "", words: usage.detail ? [usage.detail] : [], tone: null, note: "", noteTone: null };
      groups.push(last);
      continue;
    }
    if (resets && last && /-reset$/.test(String(entry.key))) {
      last.resets = last.resets || resets;
      continue;
    }
    if (!usage.label) continue;
    if (label === null && last) last.words.push(usage.label);
    else groups.push({ label: label || "", percent: null, cells: usage.cells, value: usage.label, resets: "", words: [], tone: null, note: "", noteTone: null });
  }
  return groups;
}
