// A turn's steps, opened: one line per step (cell, verb, label, duration), the
// assistant's remarks between them, and under a pressed step what it did in full:
// the whole command, its output, or the diff of an edit or write. Each in a
// coloured, selectable code view that scrolls past its first lines.

import { div } from "gpui-kit";
import { Editor, h_flex, v_flex } from "gpui-base";
import { formatDuration } from "./model/format.js";
import { diffRows } from "./model/tools.js";
import { trail } from "./model/transcript.js";
import { cell, stepColor } from "./cells.js";
import { copyButton, hoverArea } from "./copy.js";
import { MONO, codeFont, mix, monoLine } from "./ui.js";

const LINE = 24;
const CODE_LINE = 20; // a line of a code view at 12.5 px, as markdown.js
const SHOWN = 16; // a box shows this many lines, then scrolls
const DIFF_MAX = 2000; // rows of a diff drawn at all
const RESULT_PAD = 8;
const RESULT_GAP = 6;
const GUTTER = 44; // a diff's line numbers and sign
const FRAME = 14; // the list's own padding and rules
const OPEN = { duration: 180, easing: "ease-out" };

const NOTES = { compaction: "Context compacted", branch: "Summary of a branch left behind" };

/** The word for what a step did. */
export function stepVerb(step) {
  return step.kind === "run" ? "run" : step.name;
}

const FILE_LANGUAGES = { md: "markdown", rs: "rust", yml: "yaml", py: "python", sh: "bash", htm: "html" };

/** What a pressed step shows, in order: each a box of `lines` lines. */
function boxes(step) {
  const all = [];
  if (step.diff) {
    const extension = (/\.([\w+]+)$/.exec(step.label) || [])[1] || "";
    all.push({ kind: "diff", rows: diffRows(step.diff).slice(0, DIFF_MAX), language: FILE_LANGUAGES[extension] || extension });
  }
  if (step.detail) all.push({ kind: "code", text: step.detail.text, language: step.detail.language });
  // An edit's output only says it worked: the diff is what it did.
  const output = step.result.replace(/\s+$/, "");
  if (output && !(step.diff && step.ok !== false)) all.push({ kind: "code", text: output, language: "text" });
  for (const box of all) box.lines = box.kind === "diff" ? box.rows.length : box.text.split("\n").length;
  return all;
}

const boxHeight = (box) => Math.min(box.lines, SHOWN) * CODE_LINE + RESULT_PAD * 2 + RESULT_GAP;

/** The height the opened list takes, so it can open with motion. */
function stepListHeight(turn, openSteps) {
  let height = FRAME;
  for (const row of trail(turn)) {
    height += LINE;
    if (row.type === "step" && openSteps.has(row.step.id)) for (const box of boxes(row.step)) height += boxHeight(box);
  }
  return height;
}

// Lines drawn plain until the code view exists (it is made after the draw that asks for it).
function plainLines(t, lines) {
  return v_flex()
    .font_family(codeFont())
    .text_size(12.5)
    .text_color(t.foreground)
    .children(lines.slice(0, SHOWN).map((line) => div().h(CODE_LINE).flex_none().whitespace_nowrap().child(monoLine(line))));
}

// The box; `body` is its content, `copy` what its copy button copies.
function frame(t, id, box, body, copy, ui) {
  return hoverArea(div(), id, ui.pointer)
    .relative()
    .ml(24)
    .mb(RESULT_GAP)
    .h(boxHeight(box) - RESULT_GAP)
    .flex_none()
    .rounded(8)
    .bg(mix(t.background, t.surface, 0.5))
    .overflow_hidden()
    .child(body)
    .child(div().absolute().top(4).right(4).child(copyButton(t, id, copy, ui.pointer)));
}

function codeBox(t, id, box, ui) {
  const view = ui.views.view(id, box.text, box.language);
  const height = Math.min(box.lines, SHOWN) * CODE_LINE;
  const body = div()
    .px(10)
    .py(RESULT_PAD)
    .child(view ? Editor.new(view).w_full().h(height) : plainLines(t, box.text.split("\n")));
  return frame(t, id, box, body, box.text, ui);
}

// The diff: a tinted row per line under one coloured code view of the file's text.
function diffBox(t, id, box, ui) {
  const text = box.rows.map((row) => row.text).join("\n");
  const view = ui.views.view(id, text, box.language);
  const height = box.rows.length * CODE_LINE;
  const tint = { add: mix(t.background, t.ansi2, 0.16), del: mix(t.background, t.ansi1, 0.16) };
  const sign = { add: "+", del: "−", same: "", gap: "" };
  const rows = box.rows.map((row) =>
    h_flex()
      .h(CODE_LINE)
      .flex_none()
      .when(Boolean(tint[row.kind]), (el) => el.bg(tint[row.kind]))
      .child(
        h_flex()
          .w(GUTTER)
          .flex_none()
          .pr(8)
          .justify_end()
          .font_family(MONO)
          .text_size(11)
          .text_color(row.kind === "add" ? t.ansi2 : row.kind === "del" ? t.ansi1 : t.dim)
          .child(row.kind === "gap" ? "⋯" : `${sign[row.kind]}${row.number}`),
      ),
  );
  const copy = box.rows.map((row) => (row.kind === "gap" ? "..." : `${row.kind === "add" ? "+" : row.kind === "del" ? "-" : " "}${row.text}`)).join("\n");
  const body = div()
    .id(`${id}-scroll`)
    .size_full()
    .py(RESULT_PAD)
    .overflow_y_scroll()
    .child(
      div()
        .relative()
        .h(height)
        .child(v_flex().children(rows))
        .child(
          div()
            .absolute()
            .top(0)
            .left(GUTTER)
            .right(0)
            .h(height)
            .child(view ? Editor.new(view).w_full().h(height) : plainLines(t, box.rows.map((row) => row.text))),
        ),
    );
  return frame(t, id, box, body, copy, ui);
}

// Markdown read as one line: the marks go, the words stay.
function plain(text) {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(#+|[-*+]|\d+\.)\s+/gm, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function remark(t, key, text, thought = false) {
  return div().id(`pi-chat-remark-${key}`).h(LINE).flex_none().flex().items_center().min_w(0)
    .child(div().truncate().text_color(t.muted).when(thought, (el) => el.italic()).child(thought ? `Thought: ${plain(text)}` : plain(text)));
}

function stepLine(t, step, open, toggle, ui) {
  const opens = Boolean(step.result || step.detail || step.diff);
  const line = h_flex()
    .id(`pi-chat-step-${step.id}`)
    .h(LINE)
    .flex_none()
    .gap(8)
    .items_center()
    .font_family(MONO)
    .text_size(12)
    .when(opens, (el) => el.cursor_pointer().hover((s) => s.bg(t.surface)).on_click((_event, cx) => toggle(step.id, cx)))
    .child(div().w(16).flex_none().flex().child(cell(stepColor(t, step), { width: 7, height: 14 })))
    .child(div().w(44).flex_none().truncate().text_color(t.muted).child(stepVerb(step)))
    .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(monoLine(step.label)))
    .child(div().flex_none().text_color(step.ok === false ? t.ansi1 : t.muted).child(step.ok === false && !step.durationMs ? "failed" : formatDuration(step.durationMs)));
  if (!opens || !open) return [line];
  return [line, ...boxes(step).map((box, index) => (box.kind === "diff" ? diffBox : codeBox)(t, `pi-chat-box-${step.id}-${index}`, box, ui))];
}

/**
 * @param {Record<string, string>} t The theme.
 * @param {object} turn
 * @param {boolean} open Closed keeps the lines, at no height, so it closes with motion too.
 * @param {Set<string>} openSteps Ids of the steps showing their result.
 * @param {(id: string, cx: object) => void} toggle
 * @param {{ views: import("./code.js").CodeViews, pointer: object }} ui The code views and the pointer (copy buttons).
 */
export function stepList(t, turn, open, openSteps, toggle, ui) {
  const lines = [];
  for (const row of trail(turn)) {
    if (row.type === "step") lines.push(...stepLine(t, row.step, openSteps.has(row.step.id), toggle, ui));
    else if (row.type === "text") lines.push(remark(t, row.key, row.text, row.thought === true));
    else lines.push(remark(t, row.key, NOTES[row.note.kind] || row.note.title || row.note.text));
  }
  return div()
    .id(`pi-chat-steps-${turn.key}`)
    .w_full()
    .h(open ? stepListHeight(turn, openSteps) : 0)
    .overflow_hidden()
    .transition("height", OPEN)
    .child(v_flex().mt(2).py(6).border_y(1).border_color(t.border).text_size(13).children(lines));
}
