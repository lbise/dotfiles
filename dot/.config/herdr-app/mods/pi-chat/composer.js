// The reply box: the text (one to eight lines), the model and thinking pickers
// under it, and the round button that sends, or stops a working Pi. Over it opens
// the slash menu, or a picker the view hands in.

import { div } from "gpui-kit";
import { Popup, Textarea, TextareaState, h_flex, v_flex } from "gpui-base";
import { sessionCommand } from "./model/lists.js";
import { takeKeys } from "./keys.js";
import { menu } from "./menu.js";
import { SlashMenu } from "./slash.js";
import { icon, mix } from "./ui.js";

const TWICE = 250; // a press that closes a menu also lands on its chip

export class Composer {
  /**
   * @param {object} chat The view: `send(text, cx)`, `stop(cx)`, `command(command, cx)`,
   *   `runSession(action, instructions, cx)`, `slashCommands()`, `loadCommands(cx)`, `busy()`.
   */
  constructor(chat) {
    this.chat = chat;
    this.slash = new SlashMenu();
    this.input = TextareaState.new({ placeholder: "Reply to Pi", rows: 1 });
    this.input.set_soft_wrap(true);
    this.input.set_auto_grow(1, 8);
    this.blank = true;
    this.open = null; // the open menu: "model" or "thinking"
    this.closedAt = 0;
    // The button's look and the slash menu depend on the text: redraw when either changes.
    this.input.on("change", (_event, cx) => {
      const text = this.input.value();
      const query = this.slash.query;
      if (this.slash.follow(text)) this.chat.loadCommands(cx);
      const blank = !text.trim();
      if (blank === this.blank && query === this.slash.query) return;
      this.blank = blank;
      cx.notify();
    });
  }

  text() {
    return this.input.value();
  }

  /** Puts `text` in the box, the caret after it. */
  set(text) {
    // set_value leaves the caret at the start; typing it in leaves it at the end.
    this.input.set_value("");
    if (text) this.input.replace(text);
    this.blank = !text.trim();
    this.slash.follow(text);
  }

  focus() {
    this.input.focus();
  }

  enter(cx) {
    const items = this.slash.items(this.chat.slashCommands());
    if (items.length) return this.accept(items[Math.min(this.slash.index, items.length - 1)], cx);
    const text = this.input.value().trim();
    if (!text) return;
    const session = sessionCommand(text);
    if (session) {
      if (this.chat.runSession(session.action, session.instructions, cx)) this.set("");
      return;
    }
    this.set("");
    this.chat.send(text, cx);
  }

  // A slash menu entry: a session command runs (or opens its picker), anything else goes in the box.
  accept(item, cx) {
    if (item.kind !== "session") this.set(`/${item.name} `);
    else if (this.chat.runSession(item.name, "", cx)) this.set("");
    cx.notify();
  }

  // ↑↓ Tab Enter Esc while the slash menu is open (keys.js hands them over).
  slashKey(key, cx) {
    const items = this.slash.items(this.chat.slashCommands());
    if (key === "up" || key === "down") this.slash.move(key === "up" ? -1 : 1, items.length);
    else if (key === "escape") this.slash.dismiss(this.input.value());
    else if (items.length) this.accept(items[Math.min(this.slash.index, items.length - 1)], cx);
    cx.notify();
  }

  // That press must not open the menu again.
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
   * @param {{ picker: import("gpui-kit").Element|null, width: number }} above A picker to show over the box, and the width a popover may take.
   */
  render(t, state, above) {
    const working = state.status === "working";
    const slash = above.picker
      ? null
      : this.slash.render(t, this.slash.items(this.chat.slashCommands()), {
          width: Math.min(560, above.width),
          busy: this.chat.busy(),
          accept: (item, cx) => this.accept(item, cx),
          hover: (index, cx) => {
            this.slash.index = index;
            cx.notify();
          },
        });
    const over = above.picker || slash;
    const box = v_flex()
      .id("pi-chat-reply")
      .w_full()
      .pt(12)
      .pb(10)
      .pl(14)
      .pr(12)
      .rounded(14)
      .bg(t.surface)
      .border_1()
      .border_color(mix(t.border, t.accent, 0.45))
      .on_key_down((event, cx) => {
        if (event.key !== "escape" || !working) return;
        cx.stop_propagation();
        this.chat.stop(cx);
      })
      .child(takeKeys(div().w_full(), slash !== null, (key, cx) => (slash ? this.slashKey(key, cx) : this.enter(cx))).child(Textarea.new(this.input).w_full().text_size(15).text_color(t.foreground)))
      .child(h_flex().mt(8).gap(2).items_center().children(this.pickers(t, state)).child(div().flex_1()).child(this.button(t, working)));
    // The popovers hang from a line along the box's top edge.
    const anchor = Popup.new("pi-chat-over-reply", div().w_full().h(0)).anchor("bottom_left").when(over, (el) => el.content(div().pb(8).child(over)));
    return v_flex().w_full().mt(14).mb(12).child(anchor).child(box);
  }
}
