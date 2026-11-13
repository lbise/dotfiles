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
