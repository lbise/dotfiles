// Pi's question, above the reply box: its options as buttons (number keys pick
// them) and a line for an answer of your own.

import { div } from "gpui-kit";
import { Input, InputState, h_flex, v_flex } from "gpui-base";
import { MONO, icon } from "./ui.js";

export class AskCard {
  /** @param {(command: object, cx: object) => void} answer Sends the `answer` command. */
  constructor(answer, cx) {
    this.answer = answer;
    this.id = null;
    this.picked = new Set();
    this.keys = cx.focus_handle();
    this.input = InputState.new({ placeholder: "Or write your own answer" });
    this.input.on("submit", (_event, cx) => {
      const text = this.input.value().trim();
      if (text) this.send(text, cx);
    });
  }

  /** Takes the question now asked (or null); true when it is a new one. */
  show(ask) {
    const id = ask ? ask.id : null;
    if (id === this.id) return false;
    this.id = id;
    this.picked = new Set();
    this.input.set_value("");
    return id !== null;
  }

  /** Gives the card the keyboard, so number keys pick. */
  focus() {
    this.keys.focus();
  }

  send(value, cx) {
    this.answer({ type: "answer", id: this.id, value }, cx);
  }

  pick(ask, index, cx) {
    const option = ask.options[index];
    if (!option) return;
    if (!ask.multi) return this.send([option.label], cx);
    if (this.picked.has(option.label)) this.picked.delete(option.label);
    else this.picked.add(option.label);
    cx.notify();
  }

  option(t, ask, option, index) {
    const on = this.picked.has(option.label);
    return h_flex()
      .id(`pi-chat-ask-${index}`)
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
      .on_click((_event, cx) => this.pick(ask, index, cx))
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
          .child(on ? icon("check", 13) : String(index + 1)),
      )
      .child(div().flex_none().text_size(14).text_color(t.foreground).child(option.label))
      .when(option.description, (el) => el.child(div().flex_1().min_w(0).truncate().text_size(13).text_color(t.muted).child(option.description)));
  }

  /**
   * @param {Record<string, string>} t The theme.
   * @param {{ id: string, question: string, options: Array<{ label: string, description?: string }>, multi: boolean }} ask
   */
  render(t, ask) {
    const options = Array.isArray(ask.options) ? ask.options : [];
    const chosen = options.filter((option) => this.picked.has(option.label)).map((option) => option.label);
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
      .on_key_down((event, cx) => {
        if (!this.keys.is_focused() || !/^[1-9]$/.test(event.key)) return;
        cx.stop_propagation();
        this.pick(ask, Number(event.key) - 1, cx);
      })
      .child(div().mb(6).text_size(15).line_height(1.5).font_medium().text_color(t.foreground).child(ask.question))
      .children(options.map((option, index) => this.option(t, ask, option, index)))
      .child(
        h_flex()
          .mt(2)
          .gap(8)
          .items_center()
          .child(
            div().flex_1().min_w(0).h(36).px(10).flex().items_center().rounded(9).bg(t.surface)
              .child(Input.new(this.input).w_full().text_size(14).text_color(t.foreground)),
          )
          .when(ask.multi, (el) =>
            el.child(
              div()
                .id("pi-chat-ask-send")
                .h(36)
                .px(14)
                .flex_none()
                .flex()
                .items_center()
                .rounded(9)
                .text_size(13)
                .font_medium()
                .bg(chosen.length ? t.accent : t.raised)
                .text_color(chosen.length ? t.accent_foreground : t.dim)
                .when(chosen.length, (button) => button.cursor_pointer().hover((s) => s.opacity(0.86)).on_click((_event, cx) => this.send(chosen, cx)))
                .child("Answer"),
            ),
          ),
      );
  }
}
