// A file's diff as rows to draw: parsed from `git diff`, with the unchanged
// lines between hunks shown or folded, side by side or not. Plain JS, no Herdr
// imports: node runs its tests.

/**
 * @typedef {{ kind: "del"|"add"|"same", text: string, old: number|null, new: number|null }} Line
 * @typedef {{ old: number, new: number, func: string, lines: Line[] }} Hunk
 * @typedef {{ hunks: Hunk[], binary: boolean }} Patch
 *
 * A row: a diff line, a fold of unchanged lines (`gap`, `count` of them, `index` in the patch's
 * gaps), or a hunk's header (`hunk`).
 * @typedef {{ kind: "del"|"add"|"same"|"gap"|"hunk", text: string, old: number|null, new: number|null, gap?: number, count?: number, hunk?: number }} Row
 */

export const MAX_LINE = 4000; // characters: longer lines are cut
export const EXPAND = 20; // lines a click on a fold shows, at each end

/**
 * `git diff` output for one file, parsed.
 * @param {string} text
 * @returns {Patch}
 */
export function parsePatch(text) {
  /** @type {Hunk[]} */
  const hunks = [];
  let binary = false;
  let hunk = null, old = 0, now = 0;
  for (const line of text.split("\n")) {
    const head = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$/.exec(line);
    if (head) {
      old = +head[1];
      now = +head[2];
      hunk = { old, new: now, func: head[3], lines: [] };
      // A side with no lines (",0") names the line before it.
      if (/^@@ -\d+,0 /.test(line)) hunk.old = old = old + 1;
      if (/^@@ -\d+(?:,\d+)? \+\d+,0 /.test(line)) hunk.new = now = now + 1;
      hunks.push(hunk);
      continue;
    }
    // Before the first hunk: the file's header ("--- a/x" is not a removed line there).
    if (!hunk) {
      if (/^Binary files .* differ$/.test(line) || line.startsWith("GIT binary patch")) binary = true;
      continue;
    }
    const sign = line[0];
    const body = cut(line.slice(1));
    if (sign === "-") hunk.lines.push({ kind: "del", text: body, old: old++, new: null });
    else if (sign === "+") hunk.lines.push({ kind: "add", text: body, old: null, new: now++ });
    else if (sign === " ") hunk.lines.push({ kind: "same", text: body, old: old++, new: now++ });
    // "\ No newline at end of file", and the empty line after the last: nothing to show.
  }
  return { hunks, binary };
}

function cut(text) {
  return text.length > MAX_LINE ? `${text.slice(0, MAX_LINE)}… (cut)` : text;
}

/**
 * The folds of a patch: the unchanged lines before each hunk and after the last, by new line number.
 * The last one's end is the file's length, when known (else it has no end and cannot open).
 * @param {Patch} patch
 * @param {number|null} newLength Lines in the new file; null when unknown.
 * @returns {Array<{ from: number, to: number, shift: number }>} Lines [from, to) of the new file;
 *   `shift`: the old number of a line is its new number plus this.
 */
export function gapsOf(patch, newLength) {
  const gaps = [];
  let next = 1, shift = 0;
  for (const hunk of patch.hunks) {
    gaps.push({ from: next, to: hunk.new, shift });
    const adds = hunk.lines.filter((line) => line.kind === "add").length;
    const dels = hunk.lines.filter((line) => line.kind === "del").length;
    const sames = hunk.lines.length - adds - dels;
    next = hunk.new + adds + sames;
    shift = hunk.old + dels + sames - next;
  }
  gaps.push({ from: next, to: newLength === null ? next : newLength + 1, shift });
  return gaps;
}

/**
 * The rows to draw.
 * @param {Patch} patch
 * @param {string[]|null} newLines The new file, for the folds; null: folds stay closed.
 * @param {Record<number, number>|"all"} open Lines shown at each end of a fold, by its index; "all": the whole file.
 * @returns {Row[]}
 */
export function buildRows(patch, newLines, open) {
  const gaps = gapsOf(patch, newLines ? newLines.length : null);
  /** @type {Row[]} */
  const rows = [];
  const same = (n, shift) => ({ kind: "same", text: cut(newLines[n - 1] ?? ""), old: n + shift, new: n });
  gaps.forEach((gap, index) => {
    const size = gap.to - gap.from;
    if (size > 0) {
      const each = !newLines ? 0 : open === "all" ? size : open[index] || 0;
      // Lines show from the hunk above (top) and the hunk below (bottom); the first fold has
      // no hunk above it, the last none below.
      let top = index === 0 ? 0 : each;
      let bottom = index === gaps.length - 1 ? 0 : each;
      if (top + bottom >= size) [top, bottom] = [size, 0];
      for (let n = gap.from; n < gap.from + top; n++) rows.push(same(n, gap.shift));
      if (size > top + bottom) rows.push({ kind: "gap", text: "", old: null, new: null, gap: index, count: size - top - bottom });
      for (let n = gap.to - bottom; n < gap.to; n++) rows.push(same(n, gap.shift));
    }
    const hunk = patch.hunks[index];
    if (!hunk) return;
    rows.push({ kind: "hunk", text: hunk.func, old: null, new: null, hunk: index });
    for (const line of hunk.lines) rows.push({ ...line });
  });
  return rows;
}

/**
 * Rows side by side: a removed run beside the added run after it, unchanged lines on both sides,
 * folds and headers across.
 * @param {Row[]} rows
 * @returns {Array<{ left: number|null, right: number|null }>} Row indices; across: both the same.
 */
export function splitRows(rows) {
  const out = [];
  let i = 0;
  while (i < rows.length) {
    const kind = rows[i].kind;
    if (kind === "del" || kind === "add") {
      const dels = [], adds = [];
      while (i < rows.length && rows[i].kind === "del") dels.push(i++);
      while (i < rows.length && rows[i].kind === "add") adds.push(i++);
      for (let k = 0; k < Math.max(dels.length, adds.length); k++) out.push({ left: dels[k] ?? null, right: adds[k] ?? null });
    } else {
      out.push({ left: i, right: i });
      i++;
    }
  }
  return out;
}

/** A short stable hash of a text (to see whether a file's diff changed). */
export function hashText(text) {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = (hash * 33 + text.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}

/** Lines of a text, without the empty one after a final newline. */
export function linesOf(text) {
  if (!text) return [];
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}
