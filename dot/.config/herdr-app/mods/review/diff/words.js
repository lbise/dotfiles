// Word-level changes inside a diff: which words of a removed line and the line
// added in its place differ. A run of removed lines followed by a run of added
// ones is paired line by line; each pair is compared word by word (a longest
// common subsequence), and the words not in common are marked. A pair less than
// MIN_ALIKE alike was rewritten, not edited: nothing is marked.
//
// The source is mods/review/diff/; scripts/herdr-app-sync-diff copies it into
// mods/pi-chat/diff/. Plain JS, no Herdr imports: node runs its tests.

const MIN_ALIKE = 0.4;
const MAX_TOKENS = 400; // per line: past this, no marks (the LCS is quadratic)
const TOKEN = /\w+|\s+|[^\w\s]/g;

/** @typedef {[number, number]} Range Characters [start, end) of a line. */

/**
 * The changed ranges of `before` and `after`, or null when they are too far apart (or too long).
 * @param {string} before
 * @param {string} after
 * @returns {{ before: Range[], after: Range[] }|null}
 */
export function wordDiff(before, after) {
  const a = before.match(TOKEN) || [];
  const b = after.match(TOKEN) || [];
  if (!a.length || !b.length || a.length > MAX_TOKENS || b.length > MAX_TOKENS) return null;
  // lcs[i][j]: the common length of a[i..] and b[j..], in characters.
  const lcs = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + a[i].length : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  if (lcs[0][0] / Math.max(before.length, after.length) < MIN_ALIKE) return null;
  const out = { before: [], after: [] };
  const mark = (ranges, start, end) => {
    const last = ranges[ranges.length - 1];
    if (last && last[1] === start) last[1] = end;
    else ranges.push([start, end]);
  };
  let i = 0, j = 0, x = 0, y = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      x += a[i++].length;
      y += b[j++].length;
    } else if (j >= b.length || (i < a.length && lcs[i + 1][j] >= lcs[i][j + 1])) {
      mark(out.before, x, (x += a[i++].length));
    } else {
      mark(out.after, y, (y += b[j++].length));
    }
  }
  // Only blanks changed between two marks: one mark (easier to read).
  for (const [ranges, text] of [[out.before, before], [out.after, after]])
    for (let k = ranges.length - 1; k > 0; k--)
      if (!text.slice(ranges[k - 1][1], ranges[k][0]).trim()) ranges.splice(k - 1, 2, [ranges[k - 1][0], ranges[k][1]]);
  return out;
}

/**
 * The marks for each row of a diff: removed runs paired with the added run right after them.
 * @param {Array<{ kind: string, text: string }>} rows Kinds "del" and "add" pair; any other ends a run.
 * @returns {Array<Range[]|null>} One entry per row; null: nothing marked.
 */
export function wordMarks(rows) {
  const out = new Array(rows.length).fill(null);
  let i = 0;
  while (i < rows.length) {
    if (rows[i].kind !== "del") { i++; continue; }
    const dels = [];
    while (i < rows.length && rows[i].kind === "del") dels.push(i++);
    const adds = [];
    while (i < rows.length && rows[i].kind === "add") adds.push(i++);
    for (let k = 0; k < Math.min(dels.length, adds.length); k++) {
      const diff = wordDiff(rows[dels[k]].text, rows[adds[k]].text);
      if (!diff) continue;
      out[dels[k]] = diff.before;
      out[adds[k]] = diff.after;
    }
  }
  return out;
}

/**
 * Spans cut where marks start and end, each with `mark` set when it is inside one.
 * @template {{ text: string }} S
 * @param {S[]} spans
 * @param {Range[]|null} ranges
 * @returns {Array<S & { mark: boolean }>}
 */
export function markSpans(spans, ranges) {
  if (!ranges || !ranges.length) return spans.map((span) => ({ ...span, mark: false }));
  const cuts = ranges.flat();
  const out = [];
  let at = 0;
  for (const span of spans) {
    let start = 0;
    const end = span.text.length;
    while (start < end) {
      const next = cuts.find((cut) => cut > at + start && cut < at + end);
      const stop = next === undefined ? end : next - at;
      const middle = at + start;
      out.push({ ...span, text: span.text.slice(start, stop), mark: ranges.some(([a, b]) => middle >= a && middle < b) });
      start = stop;
    }
    at += end;
  }
  return out;
}
