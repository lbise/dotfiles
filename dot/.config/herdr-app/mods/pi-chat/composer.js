// The reply box: the text (one to eight lines), the model and thinking pickers
// under it, and the round button that sends, or stops a working Pi.

import { div } from "gpui-kit";
import { Textarea, TextareaState, h_flex, v_flex } from "gpui-base";
import { menu } from "./menu.js";
import { icon, mix } from "./ui.js";

const TWICE = 250; // Enter reaches both the key handler and the textarea's submit

export class Composer {
  /** @param {object} chat The view: `send(text, cx)`, `stop(cx)`, `command(command, cx)`. */
  constructor(chat) {
    this.chat = chat;
    this.input = TextareaState.new({ placeholder: "Reply to Pi", rows: 1 });
    this.input.set_soft_wrap(true);
    this.input.set_auto_grow(1, 8);
    this.blank = true;
    this.enteredAt = 0;
    this.open = null; // the open menu: "model" or "thinking"
    this.closedAt = 0;
    this.input.on("submit", (event, cx) => {
      if (!event || !event.shift) this.enter(cx);
    });
    // Only the button's look depends on the text: redraw when it empties or fills.
    this.input.on("change", (_event, cx) => {
      const blank = !this.input.value().trim();
      if (blank === this.blank) return;
      this.blank = blank;
      cx.notify();
    });
  }

  text() {
    return this.input.value();
  }

  set(text) {
    this.input.set_value(text);
    this.blank = !text.trim();
  }

  focus() {
    this.input.focus();
  }

  enter(cx) {
    if (Date.now() - this.enteredAt < TWICE) return;
    this.enteredAt = Date.now();
    const text = this.input.value().trim();
    if (!text) return;
    this.set("");
    this.chat.send(text, cx);
  }

  // The press that closes a menu also lands on its chip: that click must not open it again.
  toggle(name, cx) {
    const reopens = this.open === null && Date.now() - this.closedAt < TWICE;
    this.open = this.open === name || reopens ? null : name;
    cx.notify();
  }

  close(cx) {
    if (this.open === null) return;
    this.open = null;
    this.closedAt = Date.now();
    cx.notify();
  }

  chip(t, name, text, strong) {
    return h_flex()
      .id(`pi-chat-${name}`)
      .h(24)
      .px(8)
      .flex_none()
      .items_center()
      .rounded(7)
      .cursor_pointer()
      .text_size(12.5)
      .text_color(strong ? t.foreground : t.muted)
      .when(this.open === name, (el) => el.bg(t.raised))
      .hover((s) => s.bg(t.raised).text_color(t.foreground))
      .on_click((_event, cx) => this.toggle(name, cx))
      .child(text);
  }

  pickers(t, state) {
    const parts = [];
    const model = state.model;
    if (model) {
      const models = Array.isArray(state.models) ? state.models : [];
      const same = (other) => other.provider === model.provider && other.id === model.id;
      parts.push(
        menu(t, {
          id: "pi-chat-models",
          trigger: this.chip(t, "model", model.name || model.id, true),
          open: this.open === "model",
          width: 300,
          items: models.map((entry, index) => {
            const name = entry.name || entry.id;
            const twice = models.some((other) => other !== entry && (other.name || other.id) === name);
            return { key: String(index), text: name, note: twice ? entry.provider : "", on: same(entry) };
          }),
          pick: (key, cx) => {
            const picked = models[Number(key)];
            this.close(cx);
            if (!same(picked)) this.chat.command({ type: "model", provider: picked.provider, id: picked.id }, cx);
          },
          close: (cx) => this.close(cx),
        }),
      );
    }
    if (state.thinking) {
      const levels = Array.isArray(state.thinkingLevels) ? state.thinkingLevels : [];
      parts.push(
        menu(t, {
          id: "pi-chat-thinking",
          trigger: this.chip(t, "thinking", state.thinking, false),
          open: this.open === "thinking",
          width: 150,
          items: levels.map((level) => ({ key: level, text: level, on: level === state.thinking })),
          pick: (level, cx) => {
            this.close(cx);
            if (level !== state.thinking) this.chat.command({ type: "thinking", level }, cx);
          },
          close: (cx) => this.close(cx),
        }),
      );
    }
    return parts;
  }

  button(t, working) {
    const ready = working || !this.blank;
    const label = working ? "Stop" : "Send";
    return div()
      .id("pi-chat-send")
      .size(28)
      .flex_none()
      .flex()
      .items_center()
      .justify_center()
      .rounded(14)
      .bg(ready ? t.accent : t.raised)
      .text_color(ready ? t.accent_foreground : t.dim)
      .tooltip(working ? "Stop (Esc)" : "Send (Enter)")
      .accessibility_label(label)
      .when(ready, (el) =>
        el
          .cursor_pointer()
          .hover((s) => s.opacity(0.86))
          .on_click((_event, cx) => (working ? this.chat.stop(cx) : this.enter(cx))),
      )
      .child(icon(working ? "stop" : "arrow-up", 16));
  }

  /**
   * @param {Record<string, string>} t The theme.
   * @param {object} state The feed's state.json.
   */
  render(t, state) {
    const working = state.status === "working";
    return v_flex()
      .id("pi-chat-reply")
      .w_full()
      .mt(14)
      .mb(12)
      .pt(12)
      .pb(10)
      .pl(14)
      .pr(12)
      .rounded(14)
      .bg(t.surface)
      .border_1()
      .border_color(mix(t.border, t.accent, 0.45))
      .on_key_down((event, cx) => {
        const plain = !event.modifiers.shift && !event.modifiers.alt && !event.modifiers.control;
        if (event.key === "enter" && plain) {
          cx.stop_propagation();
          this.enter(cx);
        } else if (event.key === "escape" && working) {
          cx.stop_propagation();
          this.chat.stop(cx);
        }
      })
      .child(Textarea.new(this.input).w_full().text_size(15).text_color(t.foreground))
      .child(h_flex().mt(8).gap(2).items_center().children(this.pickers(t, state)).child(div().flex_1()).child(this.button(t, working)));
  }
}
