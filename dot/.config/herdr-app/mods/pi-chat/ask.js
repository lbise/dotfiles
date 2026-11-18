// Pi's questions, above the reply box: each one's options as buttons and a line
// for words of your own, which go with your choice as a comment or stand alone as
// the answer. One question with one choice answers on a press; otherwise the
// choices are marked and Answer (or Enter) sends them all. Skip dismisses.
// Keys, while the card has the keyboard: number keys pick in the active question
// (the one last picked in; a single choice moves on to the next), ↑↓ change it.

import { div } from "gpui-kit";
import { Input, InputState, TextView, h_flex, v_flex } from "gpui-base";
import { MONO, icon } from "./ui.js";

/**
 * @typedef {{ label: string, description?: string, recommended?: boolean }} Option
 * @typedef {{ question: string, context?: string, options: Option[], multi: boolean }} Question
 * @typedef {{ id: string, questions: Question[] }} Ask
 */

const MAX_QUESTIONS = 4; // as the extension allows
const QUESTIONS_MAX_H = 440; // px

/** @param {Ask} ask */
function questionsOf(ask) {
  const list = ask && Array.isArray(ask.questions) ? ask.questions.slice(0, MAX_QUESTIONS) : [];
  return list.map((q) => ({ ...q, options: Array.isArray(q.options) ? q.options : [] }));
}

export class AskCard {
  /** @param {(command: object, cx: object) => void} answer Sends the `answer` command. */
  constructor(answer, cx) {
    this.answer = answer;
    this.id = null;
    this.questions = [];
    // Made here: an input cannot be made while a read arrives, outside a window's update.
    this.slots = Array.from({ length: MAX_QUESTIONS }, () => this.reply());
    this.replies = [];
    this.at = 0; // the active question: number keys pick in it
    this.keys = cx.focus_handle();
  }

  /** Takes the questions now asked (or null); true when they are new. */
  show(ask) {
    const id = ask ? ask.id : null;
    if (id === this.id) return false;
    this.id = id;
    this.questions = questionsOf(ask);
    this.replies = this.slots.slice(0, this.questions.length);
    this.at = 0;
    for (const reply of this.replies) {
      reply.picked = new Set();
      reply.input.set_value("");
      reply.blank = true;
    }
    return id !== null;
  }

  reply() {
    const input = InputState.new({ placeholder: "Write an answer, or a comment" });
    const reply = { picked: new Set(), input, blank: true };
    input.on("submit", (_event, cx) => this.submit(cx));
    // Answer's look depends on whether anything is written.
    input.on("change", (_event, cx) => {
      const blank = !input.value().trim();
      if (blank === reply.blank) return;
      reply.blank = blank;
      cx.notify();
    });
    return reply;
  }

  /** Gives the card the keyboard, so number keys pick. */
  focus() {
    this.keys.focus();
  }

  /** One question with one choice: a press answers. */
  quick() {
    return this.questions.length === 1 && !this.questions[0].multi;
  }

  /** One `{ selected, text }` per question, labels in option order. */
  value() {
    return this.questions.map((q, i) => ({
      selected: q.options.map((option) => option.label).filter((label) => this.replies[i].picked.has(label)),
      text: this.replies[i].input.value().trim(),
    }));
  }

  given() {
    return this.value().some((reply) => reply.selected.length || reply.text);
  }

  submit(cx) {
    if (this.id === null || !this.given()) return;
    this.answer({ type: "answer", id: this.id, value: this.value() }, cx);
  }

  skip(cx) {
    if (this.id !== null) this.answer({ type: "answer", id: this.id, value: null }, cx);
  }

  /** Number keys, ↑↓ and Enter while the card (not one of its lines) has the keyboard. */
  key(event, cx) {
    if (!this.keys.is_focused()) return;
    const n = this.questions.length;
    if (/^[1-9]$/.test(event.keystroke)) this.pick(this.at, Number(event.keystroke) - 1, cx);
    else if (event.keystroke === "up" || event.keystroke === "down") {
      this.at = (this.at + (event.keystroke === "up" ? n - 1 : 1)) % n;
      cx.notify();
    } else if (event.keystroke === "enter") this.submit(cx);
    else return;
    cx.stop_propagation();
  }

  pick(at, index, cx) {
    const q = this.questions[at];
    const option = q && q.options[index];
    if (!option) return;
    const { picked } = this.replies[at];
    if (picked.has(option.label)) picked.delete(option.label);
    else {
      if (!q.multi) picked.clear();
      picked.add(option.label);
    }
    if (this.quick() && picked.size) return this.submit(cx);
    this.at = !q.multi && picked.size ? Math.min(at + 1, this.questions.length - 1) : at;
    cx.notify();
  }

  option(t, at, option, index) {
    const on = this.replies[at].picked.has(option.label);
    return h_flex()
      .id(`pi-chat-ask-${at}-${index}`)
      .min_h(36)
      .px(10)
      .py(7)
      .gap(10)
      .items_center()
      .rounded(9)
      .cursor_pointer()
      .border_1()
      .border_color(on ? t.accent : t.border)
      .hover((s) => s.bg(t.surface))
      .on_click((_event, cx) => {
        this.focus(); // number keys go on from here, not into a line
        this.pick(at, index, cx);
      })
      .child(
        div()
          .size(20)
          .flex_none()
          .flex()
          .items_center()
          .justify_center()
          .rounded(5)
          .bg(on ? t.accent : t.surface)
          .font_family(MONO)
          .text_size(12)
          .text_color(on ? t.accent_foreground : t.muted)
          .child(on ? icon("check", 13) : at === this.at && index < 9 ? String(index + 1) : ""),
      )
      .child(div().flex_none().text_size(14).text_color(t.foreground).child(option.label))
      .when(option.recommended === true, (el) =>
        el.child(div().flex_none().px(6).rounded(5).border_1().border_color(t.accent).text_size(11).text_color(t.accent).child("Recommended")),
      )
      .when(option.description, (el) => el.child(div().flex_1().min_w(0).truncate().text_size(13).text_color(t.muted).child(option.description)));
  }

  question(t, q, at) {
    return v_flex()
      .gap(6)
      .when(at > 0, (el) => el.mt(8).pt(14).border_t(1).border_color(t.border))
      .child(div().text_size(15).line_height(1.5).font_medium().text_color(t.foreground).child(q.question))
      .when(q.context, (el) =>
        el.child(div().mb(4).text_size(13).line_height(1.5).text_color(t.muted).child(TextView.markdown(`pi-chat-ask-context-${this.id}-${at}`, q.context).selectable(true))),
      )
      .children(q.options.map((option, index) => this.option(t, at, option, index)))
      .child(
        div().mt(2).h(36).px(10).flex().items_center().rounded(9).bg(t.surface)
          .child(Input.new(this.replies[at].input).w_full().text_size(14).text_color(t.foreground)),
      );
  }

  button(t, id, text, main, on, press) {
    return div()
      .id(id)
      .h(36)
      .px(14)
      .flex()
      .items_center()
      .rounded(9)
      .text_size(13)
      .font_medium()
      .bg(main && on ? t.accent : main ? t.raised : t.background)
      .text_color(main && on ? t.accent_foreground : on ? t.muted : t.dim)
      .when(!main, (el) => el.border_1().border_color(t.border))
      .when(on, (el) => el.cursor_pointer().hover((s) => (main ? s.opacity(0.86) : s.bg(t.surface))).on_click((_event, cx) => press(cx)))
      .child(text);
  }

  /**
   * @param {Record<string, string>} t The theme.
   * @param {Ask} ask The questions drawn: the ones last shown, unless Pi's feed moved on.
   */
  render(t, ask) {
    this.show(ask);
    const ready = this.given();
    return v_flex()
      .id("pi-chat-ask")
      .w_full()
      .mt(14)
      .p(14)
      .gap(6)
      .rounded(14)
      .border_1()
      .border_color(t.input)
      .track_focus(this.keys)
      .on_key_down((event, cx) => this.key(event, cx))
      // Several long questions scroll, so Answer and the reply box stay in view.
      .child(v_flex().id("pi-chat-ask-questions").max_h(QUESTIONS_MAX_H).overflow_y_scroll().children(this.questions.map((q, at) => this.question(t, q, at))))
      .child(
        h_flex()
          .mt(4)
          .gap(8)
          .justify_end()
          .child(this.button(t, "pi-chat-ask-skip", "Skip", false, true, (cx) => this.skip(cx)))
          .when(!this.quick(), (el) => el.child(this.button(t, "pi-chat-ask-send", "Answer", true, ready, (cx) => this.submit(cx)))),
      );
  }
}
