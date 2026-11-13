// The rows of a conversation: your message, the turn's work line with its cell
// strip and steps, the answer, the changed files.

import { div } from "gpui-kit";
import { Popup, h_flex, v_flex } from "gpui-base";
import { errorText, formatDuration } from "./model/format.js";
import { copyButton, hoverArea, typedText } from "./copy.js";
import { STEP_CELL, stepCell } from "./cells.js";
import { markdown } from "./markdown.js";
import { liveTail, stepList, stepVerb } from "./steps.js";
import { MONO, icon, monoLine } from "./ui.js";

// What a work line holds besides its cells: the words, the chevron, the count.
const LINE_REST = 250;

// Your message, selectable, with its copy button beside it. One sent while Pi
// works waits until Pi takes it (a steer): it says so until it reaches the conversation.
function bubble(t, key, text, queued, pointer) {
  const id = `pi-chat-user-${key}`;
  // The copy button hangs in the right margin, level with the card's top, as an answer's does.
  return hoverArea(v_flex(), id, pointer)
    .relative()
    .w_full()
    .items_end()
    .pt(18)
    .child(
      div()
        .max_w(560)
        .px(14)
        .py(10)
        .rounded(14)
        .bg(t.surface)
        .when(queued, (el) => el.border_1().border_color(t.border).border_dashed())
        .text_size(15)
        .line_height(1.5)
        .text_color(t.foreground)
        .child(typedText(`${id}-text`, text)),
    )
    .child(div().absolute().top(18).right(-34).child(copyButton(t, id, text, pointer, "Copy your message")))
    .when(queued, (el) =>
      el.child(
        h_flex()
          .pt(6)
          .gap(6)
          .items_center()
          .text_size(12.5)
          .text_color(t.muted)
          .child(icon("history", 13))
          .child("Queued. Pi reads it once its running step ends."),
      ),
    );
}

// A line of text you may want to copy: an error, a note. Selectable, with a copy button at its end.
function copyLine(t, id, text, color, pointer) {
  return hoverArea(h_flex(), id, pointer)
    .w_full()
    .pt(10)
    .gap(8)
    .items_start()
    .text_size(13)
    .text_color(color)
    .child(div().flex_1().min_w(0).child(typedText(`${id}-text`, text)))
    .child(copyButton(t, id, text, pointer));
}

function tip(t, step) {
  const took = formatDuration(step.durationMs);
  return div()
    .mb(8)
    .px(9)
    .py(5)
    .max_w(520)
    .truncate()
    .rounded(7)
    .bg(t.surface)
    .border_1()
    .border_color(t.border)
    .shadow_lg()
    .font_family(MONO)
    .text_size(12)
    .text_color(t.foreground)
    .child(monoLine([`${stepVerb(step)} ${step.label}`, step.ok === false ? "failed" : "", took].filter(Boolean).join(" · ")));
}

// One cell per step; the pointer on a cell names its step.
function cells(ui, turn) {
  const { t, chat } = ui;
  const room = Math.max(8, Math.floor((ui.width - LINE_REST) / (STEP_CELL.width + 2)));
  const hidden = Math.max(0, turn.steps.length - room);
  const shown = turn.steps.slice(hidden).map((step) => {
    const id = `pi-chat-cell-${turn.key}-${step.id}`;
    const hovered = chat.hoveredCell === id;
    // The hit box is the cell and half of each gap beside it, so the pointer never falls between two cells.
    const body = div()
      .id(`${id}-hit`)
      .relative()
      .flex_none()
      .w(STEP_CELL.width + 2)
      .h(STEP_CELL.height + 4)
      .flex()
      .items_center()
      .justify_center()
      .on_hover((over, cx) => {
        if (over) chat.hoveredCell = id;
        else if (chat.hoveredCell === id) chat.hoveredCell = null;
        cx.notify();
      })
      .child(stepCell(t, id, step, { grown: !chat.growing.has(step.id), running: Boolean(turn.live) && step.ok === undefined }))
      .when(hovered, (el) => el.child(div().absolute().top(1).left(0).w(STEP_CELL.width + 2).h(STEP_CELL.height + 2).rounded(2.5).border_1().border_color(t.foreground)));
    return Popup.new(`${id}-tip`, body).anchor("bottom_center").when(hovered, (el) => el.content(tip(t, step)));
  });
  const count = hidden ? [div().flex_none().font_family(MONO).text_size(12).text_color(t.muted).child(`+${hidden}`)] : [];
  return h_flex().flex_none().items_center().children([...count, ...shown]);
}

function workLine(ui, turn, open) {
  const { t, chat } = ui;
  const line = h_flex()
    .id(`pi-chat-work-${turn.key}`)
    .h(34)
    .gap(10)
    .items_center()
    .text_size(13)
    .text_color(t.muted)
    .when(turn.steps.length || turn.narration.length, (el) => el.cursor_pointer().on_click((_event, cx) => chat.toggleTurn(turn.key, cx)));
  const activity = ui.look.activity === "cells" && turn.steps.length ? [cells(ui, turn)] : [];
  const figure = (text) => div().flex_none().font_family(MONO).text_size(12).child(text);
  // What it does right now is the tail's to say (liveTail, under this line).
  if (turn.live) {
    return line
      .when(!ui.asking, (el) => el.child(icon("spinner", 13).text_color(t.foreground).spin(900)))
      .child(div().flex_none().text_color(t.foreground).child(ui.asking ? "Waiting for your answer" : "Working"))
      .children(activity)
      .child(div().flex_1())
      .child(figure(formatDuration(Math.max(1000, ui.elapsed))));
  }
  const count = turn.steps.length;
  return line
    .child(div().flex_none().child(turn.durationMs ? `Worked for ${formatDuration(turn.durationMs)}` : "Worked"))
    .child(icon(open ? "chevron-down" : "chevron-right", 13))
    .children(activity)
    .child(div().flex_1())
    .when(count, (el) => el.child(figure(`${count} ${count === 1 ? "step" : "steps"}`)));
}

function work(ui, turn) {
  const { t, chat } = ui;
  const open = chat.openTurns.get(turn.key);
  // While Pi works and the list is closed, its last three steps and thoughts show under the line.
  const tail = turn.live && open !== true ? liveTail(t, turn, ui.now, (cx) => chat.toggleTurn(turn.key, cx)) : null;
  return v_flex()
    .w_full()
    .pt(10)
    .child(workLine(ui, turn, open === true))
    .when(tail !== null, (el) => el.child(tail))
    .when(open !== undefined, (el) => el.child(stepList(t, turn, open, chat.openSteps, (id, cx) => chat.toggleStep(id, cx), { views: chat.code, pointer: chat.pointer, width: ui.width, machine: chat.shown ? chat.shown.machine : null, now: ui.now })));
}

function files(t, turn) {
  const added = turn.files.reduce((sum, file) => sum + file.added, 0);
  const removed = turn.files.reduce((sum, file) => sum + file.removed, 0);
  const counts = (plus, minus) =>
    h_flex()
      .flex_none()
      .gap(8)
      .font_family(MONO)
      .text_size(12)
      .child(div().text_color(t.ansi2).child(`+${plus}`))
      .when(minus > 0, (el) => el.child(div().text_color(t.ansi1).child(`−${minus}`)));
  const line = () => h_flex().h(34).px(12).gap(8).items_center();
  const count = turn.files.length;
  return div()
    .w_full()
    .pt(14)
    .child(
      v_flex()
        .w_full()
        .rounded(10)
        .border_1()
        .border_color(t.border)
        .text_size(13)
        .child(
          line()
            .child(div().flex_1().font_medium().text_color(t.foreground).child(`${count} changed ${count === 1 ? "file" : "files"}`))
            .child(counts(added, removed)),
        )
        .children(
          turn.files.map((file) =>
            line()
              .border_t(1)
              .border_color(t.border)
              .text_color(t.muted)
              .child(icon("file"))
              .child(div().flex_1().min_w(0).truncate().font_family(MONO).text_size(12).child(monoLine(file.path)))
              .child(counts(file.added, file.removed)),
          ),
        ),
    );
}

function quiet(t, text) {
  return div().w_full().pt(10).text_size(13).text_color(t.muted).child(text);
}

const NOTES = { compaction: "Context compacted.", branch: "Came back from another branch." };

/**
 * Draws one row of rows.js.
 * @param {object} item
 * @param {{ t: Record<string, string>, look: object, width: number, elapsed: number, asking: boolean, chat: object }} ui
 *   `chat` is the view: what is open and hovered, and the handlers.
 */
export function drawRow(item, ui) {
  const { t } = ui;
  const pointer = ui.chat.pointer;
  if (item.kind === "user") return bubble(t, item.key, item.text || "Image", item.queued === true, pointer);
  if (item.kind === "work") return work(ui, item.turn);
  // An answer follows its turn's work line; one given without any work comes right after the message.
  if (item.kind === "answer") {
    const gap = item.turn.steps.length || item.turn.live || item.turn.narration.length ? 4 : 12;
    const id = `pi-chat-md-${item.key}`;
    // The copy button hangs in the margin beside the answer's first line, so the answer keeps its place.
    return hoverArea(div(), id, pointer)
      .relative()
      .w_full()
      .pt(gap)
      .child(markdown(t, id, item.turn.answer, pointer, ui.chat.code))
      .when(!item.turn.live, (el) => el.child(div().absolute().top(gap).right(-34).child(copyButton(t, id, item.turn.answer, pointer, "Copy the answer"))));
  }
  if (item.kind === "files") return files(t, item.turn);
  if (item.kind === "end") {
    const error = item.turn.error;
    if (!error) return quiet(t, "Stopped.");
    return copyLine(t, `pi-chat-end-${item.key}`, `Pi stopped with an error: ${errorText(error)}`, t.ansi1, pointer);
  }
  if (item.kind === "note") {
    if (NOTES[item.note.kind]) return quiet(t, NOTES[item.note.kind]);
    return copyLine(t, `pi-chat-note-${item.key}`, [item.note.title, item.note.text].filter(Boolean).join(": "), t.muted, pointer);
  }
  if (item.kind === "compacting") {
    return h_flex().w_full().pt(10).h(44).gap(10).items_center().text_size(13).text_color(t.foreground)
      .child(icon("spinner", 13).spin(900))
      .child(div().child("Compacting…"));
  }
  return quiet(t, "Earlier messages are not loaded.");
}
