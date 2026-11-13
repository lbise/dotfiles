// A turn's steps, opened: one line per step (cell, verb, label, duration), the
// assistant's remarks between them, and a step's result under it when pressed.

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { formatDuration } from "./model/format.js";
import { trail } from "./model/transcript.js";
import { cell, stepColor } from "./cells.js";
import { MONO, codeFont, mix, monoLine } from "./ui.js";

const LINE = 24;
const RESULT_LINE = 18;
const RESULT_LINES = 12;
const RESULT_PAD = 8;
const RESULT_GAP = 6;
const FRAME = 14; // the list's own padding and rules
const OPEN = { duration: 180, easing: "ease-out" };

const NOTES = { compaction: "Context compacted", branch: "Summary of a branch left behind" };

/** The word for what a step did. */
export function stepVerb(step) {
  return step.kind === "run" ? "run" : step.name;
}

function resultLines(step) {
  const lines = step.result.replace(/\s+$/, "").split("\n");
  const shown = lines.slice(0, RESULT_LINES);
  const more = lines.length - shown.length;
  return more > 0 ? [...shown, `… ${more} more ${more === 1 ? "line" : "lines"}`] : shown;
}

function resultHeight(step) {
  return resultLines(step).length * RESULT_LINE + RESULT_PAD * 2 + RESULT_GAP;
}

/** The height the opened list takes, so it can open with motion. */
function stepListHeight(turn, openSteps) {
  let height = FRAME;
  for (const row of trail(turn)) height += LINE + (row.type === "step" && row.step.result && openSteps.has(row.step.id) ? resultHeight(row.step) : 0);
  return height;
}

function remark(t, key, text) {
  return div().id(`pi-chat-remark-${key}`).h(LINE).flex_none().flex().items_center().min_w(0)
    .child(div().truncate().text_color(t.muted).child(text.replace(/\s+/g, " ")));
}

function stepLine(t, step, open, toggle) {
  const opens = Boolean(step.result);
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
  const result = v_flex()
    .ml(24)
    .mb(RESULT_GAP)
    .px(10)
    .py(RESULT_PAD)
    .flex_none()
    .rounded(8)
    .bg(mix(t.background, t.surface, 0.5))
    .font_family(codeFont())
    .text_size(12)
    .text_color(t.muted)
    .overflow_hidden()
    .children(resultLines(step).map((text) => div().h(RESULT_LINE).flex_none().whitespace_nowrap().child(monoLine(text))));
  return [line, result];
}

/**
 * @param {Record<string, string>} t The theme.
 * @param {object} turn
 * @param {boolean} open Closed keeps the lines, at no height, so it closes with motion too.
 * @param {Set<string>} openSteps Ids of the steps showing their result.
 * @param {(id: string, cx: object) => void} toggle
 */
export function stepList(t, turn, open, openSteps, toggle) {
  const lines = [];
  for (const row of trail(turn)) {
    if (row.type === "step") lines.push(...stepLine(t, row.step, openSteps.has(row.step.id), toggle));
    else if (row.type === "text") lines.push(remark(t, row.key, row.text));
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
