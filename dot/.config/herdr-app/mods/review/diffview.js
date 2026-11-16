// One file's diff on screen: its rows (patch.js) with syntax colours from whole
// files where it can (diff/highlight.js), changed words marked (diff/words.js),
// unified or side by side. Only the rows in view are built (a virtual list).
// Sideways, the text moves by `x` while the numbers stay: the virtual list keeps
// its rows at the view's width, so a scroll area around it cannot scroll them.

import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { settings } from "herdr";
import { highlightLines, highlightRows, languageOf } from "./diff/highlight.js";
import { markSpans, wordMarks } from "./diff/words.js";
import { buildRows, hashText, parsePatch, splitRows } from "./patch.js";

export const ROW = 20;
const NUMBER = 40; // a line number's column
const MARKER = 12; // the comment dot's column
const SIGN = 14;
export const CHAR = 7.3; // a code character's width at the diff's size, about
const SIGNS = { add: "+", del: "−", same: " " };

/** The theme's colours for code, by kind of token (as pi-chat's). */
export function syntax(t) {
  return { keyword: t.ansi5, string: t.ansi2, "string.escape": t.ansi6, comment: t.muted, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6, boolean: t.ansi1, property: t.ansi4 };
}

/** `a` mixed with `b`: 0 is all `a`, 1 is all `b`. Both "#rrggbb[aa]"; alpha is dropped. */
export function mix(a, b, share) {
  const channel = (hex, at) => parseInt(hex.slice(at, at + 2), 16);
  const parts = [1, 3, 5].map((at) => Math.round(channel(a, at) * (1 - share) + channel(b, at) * share));
  return `#${parts.map((part) => part.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * A loaded file's diff, ready to draw. `folds`: lines shown at each end of a fold, or "all".
 * @param {string} path
 * @param {{ patch: string, oldLines: string[]|null, newLines: string[]|null }} loaded
 */
export function makeView(path, loaded) {
  const language = languageOf(path);
  const view = {
    path,
    text: loaded.patch,
    hash: hashText(loaded.patch),
    patch: parsePatch(loaded.patch),
    oldLines: loaded.oldLines,
    newLines: loaded.newLines,
    language,
    // Each side tokenized whole, once: a hunk that starts inside a comment colours right.
    oldSpans: loaded.oldLines && language ? highlightLines(loaded.oldLines, language) : null,
    newSpans: loaded.newLines && language ? highlightLines(loaded.newLines, language) : null,
    folds: /** @type {Record<number, number>|"all"} */ ({}),
  };
  layoutView(view);
  return view;
}

/** (Re)builds the rows, after the folds changed. */
export function layoutView(view) {
  const rows = buildRows(view.patch, view.newLines, view.folds);
  // The hunks tokenized on their own, made only when a row needs them.
  let fallback;
  const hunkSpans = () =>
    fallback !== undefined ? fallback : (fallback = view.language ? highlightRows(rows.map((row) => (row.kind === "hunk" ? { ...row, kind: "gap" } : row)), view.language) : null);
  view.rows = rows;
  view.marks = wordMarks(rows);
  view.spans = rows.map((row, index) => {
    if (row.kind === "hunk" || row.kind === "gap") return [];
    const whole = row.kind === "del" ? view.oldSpans?.[row.old - 1] : row.new !== null ? view.newSpans?.[row.new - 1] : null;
    // A whole-file line that is not the row's (a file changed since the diff): the hunk's own.
    const spans = whole && whole.map((span) => span.text).join("") === row.text ? whole : hunkSpans()?.[index];
    return spans || [{ text: row.text, kind: null }];
  });
  view.pairs = splitRows(rows);
  // A row's side-by-side pair.
  view.pairOf = [];
  view.pairs.forEach((pair, index) => {
    if (pair.left !== null) view.pairOf[pair.left] = index;
    if (pair.right !== null) view.pairOf[pair.right] = index;
  });
  view.columns = rows.reduce((most, row) => Math.max(most, row.text.replace(/\t/g, "    ").length), 0);
}

/**
 * The text's room and how far it scrolls sideways, design px, for a view `width` wide.
 * Side by side, both halves move together. Compact: one number column (the narrow panel).
 */
export function sideways(view, width, split, compact) {
  const gutter = MARKER + NUMBER * (split || compact ? 1 : 2) + SIGN;
  const room = Math.max(1, (split ? (width - 1) / 2 : width) - gutter);
  return { gutter, room, max: Math.max(0, view.columns * CHAR + 24 - room) };
}

/**
 * The colours a diff draws with.
 * @param {Record<string, string>} t The theme.
 */
export function palette(t) {
  return {
    t,
    syntax: syntax(t),
    tint: { add: mix(t.background, t.ansi2, 0.14), del: mix(t.background, t.ansi1, 0.14) },
    mark: { add: mix(t.background, t.ansi2, 0.36), del: mix(t.background, t.ansi1, 0.36) },
    selected: mix(t.background, t.accent, 0.28),
    font: settings().font_family || "JetBrains Mono",
  };
}

function code(p, view, index, x) {
  const row = view.rows[index];
  const spans = markSpans(view.spans[index], view.marks[index]);
  const text = h_flex()
    .absolute()
    .top(0)
    .h(ROW)
    .left(-x)
    .whitespace_nowrap()
    .children(
      spans.map((span) =>
        div()
          .flex_none()
          .when(Boolean(span.kind && p.syntax[span.kind]), (el) => el.text_color(p.syntax[span.kind]))
          .when(span.mark, (el) => el.bg(p.mark[row.kind]))
          .child(span.text.replace(/\t/g, "    ") || " "),
      ),
    );
  return div().relative().flex_1().min_w(0).h(ROW).overflow_hidden().child(text);
}

function number(p, value) {
  return div().w(NUMBER).flex_none().pr(8).text_right().text_size(11).text_color(p.t.dim).child(value === null || value === undefined ? "" : String(value));
}

/** A fold or a hunk header: across the whole width. */
function across(p, view, index, foldable) {
  const row = view.rows[index];
  const t = p.t;
  if (row.kind === "hunk")
    return h_flex().w_full().h(ROW).flex_none().bg(t.raised).text_color(t.dim).pl(MARKER + 8).text_size(11).child(row.text ? `@@ ${row.text}` : "@@");
  const label = `⋯ ${row.count} unchanged line${row.count === 1 ? "" : "s"}${foldable ? " · click to show" : ""}`;
  return h_flex().w_full().h(ROW).flex_none().bg(t.surface).text_color(t.dim).pl(MARKER + 8).text_size(11).child(label);
}

/**
 * A row of the unified diff.
 * @param {ReturnType<typeof palette>} p
 * @param {{ selected: (index: number) => boolean, commented: (index: number) => boolean, foldable: boolean, x: number, compact: boolean }} marks
 */
export function unifiedRow(p, view, index, marks) {
  const row = view.rows[index];
  if (row.kind === "hunk" || row.kind === "gap") return across(p, view, index, marks.foldable);
  const bg = marks.selected(index) ? p.selected : p.tint[row.kind];
  return h_flex()
    .w_full()
    .h(ROW)
    .flex_none()
    .when(Boolean(bg), (el) => el.bg(bg))
    .child(div().w(MARKER).flex_none().text_color(p.t.accent).text_size(10).child(marks.commented(index) ? "●" : ""))
    .when(marks.compact, (el) => el.child(number(p, row.kind === "del" ? row.old : row.new)))
    .when(!marks.compact, (el) => el.child(number(p, row.old)).child(number(p, row.new)))
    .child(div().w(SIGN).flex_none().text_color(row.kind === "add" ? p.t.ansi2 : row.kind === "del" ? p.t.ansi1 : p.t.dim).child(SIGNS[row.kind]))
    .child(code(p, view, index, marks.x));
}

/** A row of the side-by-side diff: the pair's left (old) and right (new) halves. */
export function splitRow(p, view, pair, marks) {
  const { left, right } = pair;
  if (left !== null && left === right && (view.rows[left].kind === "hunk" || view.rows[left].kind === "gap")) return across(p, view, left, marks.foldable);
  const half = (index, side) => {
    if (index === null) return div().flex_1().min_w(0).h(ROW).bg(p.t.surface);
    const row = view.rows[index];
    const kind = row.kind === "same" ? null : row.kind;
    const bg = marks.selected(index) ? p.selected : kind ? p.tint[kind] : null;
    return h_flex()
      .flex_1()
      .min_w(0)
      .h(ROW)
      .when(Boolean(bg), (el) => el.bg(bg))
      .child(div().w(MARKER).flex_none().text_color(p.t.accent).text_size(10).child(marks.commented(index) ? "●" : ""))
      .child(number(p, side === "old" ? row.old : row.new))
      .child(div().w(SIGN).flex_none().text_color(kind === "add" ? p.t.ansi2 : kind === "del" ? p.t.ansi1 : p.t.dim).child(kind ? SIGNS[kind] : " "))
      .child(code(p, view, index, marks.x));
  };
  return h_flex()
    .w_full()
    .h(ROW)
    .flex_none()
    .child(half(left, "old"))
    .child(div().w(1).h_full().flex_none().bg(p.t.border))
    .child(half(right, "new"));
}
