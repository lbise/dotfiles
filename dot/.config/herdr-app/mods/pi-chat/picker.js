// The session, tree and model pickers: a popover over the reply box with a search line
// and a list, keyboard first (↑↓ move, Enter picks, Esc closes, typing filters).
// The list is what Pi answers to a `list` request, asked for on every open.

import { div } from "gpui-kit";
import { Input, InputState, ScrollHandle, h_flex, v_flex } from "gpui-base";
import { formatAge } from "./model/format.js";
import { matches } from "./model/lists.js";
import { askList } from "./feeds.js";
import { selectAll, takeKeys } from "./keys.js";
import { MONO, icon, mix } from "./ui.js";

const ROW = 30;
const INDENT = 14;
const KINDS = {
  sessions: { placeholder: "Search sessions", empty: "No sessions in this folder yet.", fields: (row) => [row.title, row.cwd] },
  tree: { placeholder: "Search your messages", empty: "Nothing to go back to yet.", fields: (row) => [row.text, row.label || ""] },
  models: { placeholder: "Search models", empty: "Pi has no model it can use.", fields: (row) => [row.name, row.id, row.provider] },
};

export class Picker {
  /** @param {object} chat The view: `sessionCommand(command, cx)`, `command(command, cx)`, `pickerClosed(cx)`. */
  constructor(chat) {
    this.chat = chat;
    this.kind = null; // "sessions" | "tree" while open
    this.rows = null; // null until Pi answered
    this.problem = "";
    this.index = 0;
    this.summarize = false;
    this.asked = null;
    this.scroll = ScrollHandle.new();
    this.inputs = {};
    for (const kind of Object.keys(KINDS)) {
      const input = InputState.new({ placeholder: KINDS[kind].placeholder });
      input.on("change", (_event, cx) => {
        this.index = 0;
        this.scroll.scroll_to_item(0);
        cx.notify();
      });
      this.inputs[kind] = input;
    }
  }

  /** Opens the picker and asks Pi for its list. */
  open(kind, feed, cx) {
    Object.assign(this, { kind, rows: null, problem: "", index: 0, summarize: false });
    this.inputs[kind].set_value("");
    this.inputs[kind].focus();
    const asked = (this.asked = {});
    cx.spawn(async (cx) => {
      try {
        const rows = await askList(feed, kind);
        if (this.asked !== asked) return;
        this.rows = rows;
        // Sessions start at the newest other one, the tree and the models where Pi is now.
        const start = rows.findIndex((row) => (kind === "sessions" ? !row.current : row.current));
        this.index = Math.max(0, start);
        this.scroll.scroll_to_item(this.index);
      } catch {
        if (this.asked !== asked) return;
        this.problem = `Pi did not send its ${kind}. Its chat extension may be older than this chat: run /reload in Pi.`;
      }
      cx.notify();
    });
    cx.notify();
  }

  close(cx) {
    if (!this.kind) return;
    this.kind = null;
    this.asked = null;
    this.chat.pickerClosed(cx);
  }

  shown() {
    if (!this.rows) return [];
    const query = this.inputs[this.kind].value().trim();
    return query ? this.rows.filter((row) => matches(query, KINDS[this.kind].fields(row))) : this.rows;
  }

  move(by, cx) {
    const count = this.shown().length;
    if (!count) return;
    this.index = Math.max(0, Math.min(count - 1, this.index + by));
    this.scroll.scroll_to_item(this.index);
    cx.notify();
  }

  pick(row, cx) {
    const kind = this.kind;
    this.close(cx);
    if (kind === "sessions" && !row.current) this.chat.sessionCommand({ type: "session", action: "resume", path: row.path }, cx);
    if (kind === "tree") this.chat.sessionCommand({ type: "session", action: "tree", entryId: row.id, summarize: this.summarize }, cx);
    if (kind === "models" && !row.current) this.chat.command({ type: "model", provider: row.provider, id: row.id }, cx);
  }

  // A model in or out of the ones Ctrl+P cycles through. None checked is Pi's "no scope": all of them.
  toggleScope(row, cx) {
    row.scoped = !row.scoped;
    this.chat.command({ type: "scope", models: this.rows.filter((one) => one.scoped).map(({ provider, id }) => ({ provider, id })) }, cx);
    cx.notify();
  }

  // ↑↓ Tab Enter Esc from the search line (keys.js hands them over).
  key(key, cx) {
    if (key === "ctrl-a") selectAll(this.inputs[this.kind], cx);
    else if (key === "up" || key === "down") this.move(key === "up" ? -1 : 1, cx);
    else if (key === "escape") this.close(cx);
    else if (key === "tab") {
      const row = this.shown()[this.index];
      if (this.kind === "models" && row) return this.toggleScope(row, cx);
      if (this.kind !== "tree") return;
      this.summarize = !this.summarize;
      cx.notify();
    } else {
      const row = this.shown()[this.index];
      if (row) this.pick(row, cx);
    }
  }

  line(t, row, index) {
    const on = index === this.index;
    const base = h_flex()
      .id(`pi-chat-pick-${index}`)
      .h(ROW)
      .px(8)
      .gap(8)
      .flex_none()
      .items_center()
      .rounded(6)
      .cursor_pointer()
      .when(on, (el) => el.bg(mix(t.hover, t.foreground, 0.06)))
      .on_hover((over, cx) => {
        if (!over || this.index === index) return;
        this.index = index;
        cx.notify();
      })
      .on_click((_event, cx) => this.pick(row, cx));
    if (this.kind === "sessions") {
      const meta = [row.messages === null ? "" : `${row.messages} ${row.messages === 1 ? "message" : "messages"}`, formatAge(row.modified, Date.now())].filter(Boolean).join(" · ");
      return base
        .child(div().w(14).flex_none().text_color(t.foreground).when(row.current, (el) => el.child(icon("check", 14))))
        .child(div().flex_1().min_w(0).truncate().text_color(on || row.current ? t.foreground : t.muted).child(row.title || "Untitled session"))
        .child(div().flex_none().font_family(MONO).text_size(12).text_color(t.muted).child(meta));
    }
    if (this.kind === "models") {
      return base
        .child(
          div()
            .id(`pi-chat-pick-scope-${index}`)
            .size(14)
            .flex_none()
            .flex()
            .items_center()
            .justify_center()
            .rounded(4)
            .border_1()
            .border_color(row.scoped ? t.accent : t.dim)
            .when(row.scoped, (el) => el.bg(t.accent).text_color(t.accent_foreground).child(icon("check", 12)))
            .tooltip(row.scoped ? "Ctrl+P cycles through it (Tab)" : "Add to Ctrl+P (Tab)")
            .on_click((_event, cx) => {
              cx.stop_propagation();
              this.toggleScope(row, cx);
            }),
        )
        .child(div().flex_1().min_w(0).truncate().text_color(on || row.current ? t.foreground : t.muted).child(row.name))
        .when(row.current, (el) => el.child(div().flex_none().text_size(12).text_color(t.muted).child("in use")))
        .child(div().flex_none().font_family(MONO).text_size(12).text_color(t.muted).child(row.provider));
    }
    return base
      .child(div().w(row.depth * INDENT).flex_none())
      .child(
        div()
          .size(6)
          .flex_none()
          .rounded(3)
          .when(row.current, (el) => el.bg(t.foreground))
          .when(!row.current && row.active, (el) => el.bg(t.muted))
          .when(!row.active, (el) => el.border_1().border_color(t.dim)),
      )
      .child(div().flex_1().min_w(0).truncate().text_color(on || row.active ? t.foreground : t.muted).child(row.text || "Image"))
      .when(row.label, (el) => el.child(div().flex_none().px(6).py(1).rounded(5).bg(t.raised).text_size(12).text_color(t.muted).child(row.label)))
      .when(row.current, (el) => el.child(div().flex_none().text_size(12).text_color(t.muted).child("you are here")));
  }

  // The switch under the tree: leave the branch as it is, or summarize it.
  summary(t) {
    const on = this.summarize;
    return h_flex()
      .id("pi-chat-pick-summarize")
      .h(36)
      .px(12)
      .gap(10)
      .items_center()
      .border_t(1)
      .border_color(t.border)
      .cursor_pointer()
      .text_size(12.5)
      .text_color(on ? t.foreground : t.muted)
      .hover((s) => s.text_color(t.foreground))
      .on_click((_event, cx) => {
        this.summarize = !this.summarize;
        cx.notify();
      })
      .child(
        div()
          .relative()
          .w(26)
          .h(16)
          .flex_none()
          .rounded(8)
          .bg(on ? t.accent : t.raised)
          .child(div().id("pi-chat-pick-knob").absolute().top(2).left(on ? 12 : 2).size(12).rounded(6).bg(on ? t.accent_foreground : t.muted).transition("left", { duration: 140, easing: "ease-out" })),
      )
      .child(div().flex_1().child("Summarize the branch you leave"))
      .child(div().flex_none().font_family(MONO).text_size(12).text_color(t.muted).child("Tab"));
  }

  // The line under the models: what Ctrl+P cycles through now.
  scopeLine(t) {
    const count = this.rows ? this.rows.filter((row) => row.scoped).length : 0;
    const text = count ? `Ctrl+P cycles through the ${count} checked ${count === 1 ? "model" : "models"}. Saved to Pi's settings.` : "Ctrl+P cycles through every model. Check the ones it should.";
    return h_flex()
      .h(36)
      .px(12)
      .gap(10)
      .items_center()
      .border_t(1)
      .border_color(t.border)
      .text_size(12.5)
      .text_color(t.muted)
      .child(div().flex_1().min_w(0).truncate().child(text))
      .child(div().flex_none().font_family(MONO).text_size(12).child("Tab"));
  }

  body(t) {
    if (this.problem) return div().px(12).py(10).text_size(12.5).line_height(1.5).text_color(t.ansi1).child(this.problem);
    if (!this.rows) return h_flex().h(ROW + 8).px(12).gap(8).items_center().text_size(12.5).text_color(t.muted).child(icon("spinner", 13).spin(900)).child("Asking Pi…");
    const rows = this.shown();
    if (!rows.length) return div().px(12).py(10).text_size(12.5).text_color(t.muted).child(this.rows.length ? "Nothing matches." : KINDS[this.kind].empty);
    return v_flex()
      .id(`pi-chat-pick-list-${this.kind}`)
      .max_h(ROW * 10 + 8)
      .p(4)
      .gap(1)
      .overflow_y_scroll()
      .track_scroll(this.scroll)
      .children(rows.map((row, index) => this.line(t, row, index)));
  }

  /**
   * The popover's content, or null while closed.
   * @param {Record<string, string>} t The theme.
   * @param {number} width
   */
  render(t, width) {
    if (!this.kind) return null;
    return v_flex()
      .id("pi-chat-picker")
      .w(width)
      .rounded(10)
      .bg(t.popover)
      .border_1()
      .border_color(t.border)
      .shadow_lg()
      .overflow_hidden()
      .text_size(13)
      .on_mouse_down_out((_event, cx) => this.close(cx))
      .child(
        h_flex()
          .h(40)
          .px(12)
          .gap(8)
          .items_center()
          .border_b(1)
          .border_color(t.border)
          .text_color(t.muted)
          .child(icon("search", 14))
          .child(takeKeys(div().flex_1(), true, (key, cx) => this.key(key, cx)).child(Input.new(this.inputs[this.kind]).w_full().text_size(13).text_color(t.foreground))),
      )
      .child(this.body(t))
      .when(this.kind === "tree", (el) => el.child(this.summary(t)))
      .when(this.kind === "models" && this.rows && !this.problem, (el) => el.child(this.scopeLine(t)));
  }
}
