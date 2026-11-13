// The slash menu: a `/` at the start of the reply box lists what can follow it,
// filtered as you type. Session commands first (the chat runs them), then Pi's
// skills, prompt templates and extension commands.

import { div } from "gpui-kit";
import { ScrollHandle, h_flex, v_flex } from "gpui-base";
import { slashItems } from "./model/lists.js";
import { mix } from "./ui.js";

const ROW = 30;
const SHOWN = 9;
const KIND = { session: "session", skill: "skill", prompt: "prompt", command: "command" };

export class SlashMenu {
  constructor() {
    this.index = 0;
    this.query = null; // what follows the slash while the menu is open, else null
    this.dismissed = ""; // the text Esc closed the menu on: it stays closed until the text changes
    this.scroll = ScrollHandle.new();
  }

  /** Follows the reply box. True when the menu just opened. */
  follow(text) {
    const match = /^\/(\S*)$/.exec(text);
    const query = match && text !== this.dismissed ? match[1] : null;
    if (text !== this.dismissed) this.dismissed = "";
    const opened = query !== null && this.query === null;
    if (query !== this.query) {
      this.index = 0;
      this.scroll.scroll_to_item(0);
    }
    this.query = query;
    return opened;
  }

  dismiss(text) {
    this.dismissed = text;
    this.query = null;
  }

  items(commands) {
    return this.query === null ? [] : slashItems(this.query, commands);
  }

  move(by, count) {
    this.index = Math.max(0, Math.min(count - 1, this.index + by));
    this.scroll.scroll_to_item(this.index);
  }

  /**
   * The menu's content, or null when there is nothing to show.
   * @param {Record<string, string>} t The theme.
   * @param {import("./model/lists.js").SlashItem[]} items
   * @param {{ width: number, busy: boolean, accept: (item: object, cx: object) => void, hover: (index: number, cx: object) => void }} options
   */
  render(t, items, { width, busy, accept, hover }) {
    if (!items.length) return null;
    const row = (item, index) => {
      const on = index === this.index;
      const off = busy && item.kind === "session";
      return h_flex()
        .id(`pi-chat-slash-${index}`)
        .h(ROW)
        .px(8)
        .gap(10)
        .flex_none()
        .items_center()
        .rounded(6)
        .when(on, (el) => el.bg(mix(t.hover, t.foreground, 0.06)))
        .when(!off, (el) => el.cursor_pointer().on_click((_event, cx) => accept(item, cx)))
        .on_hover((over, cx) => {
          if (over && !on) hover(index, cx);
        })
        .child(div().flex_none().text_color(off ? t.dim : t.foreground).child(`/${item.name}`))
        .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(off ? t.dim : t.muted).child(off ? "When Pi is idle" : item.description))
        .child(div().flex_none().text_size(12).text_color(t.muted).child(KIND[item.kind]));
    };
    return v_flex()
      .id("pi-chat-slash")
      .w(width)
      .max_h(ROW * SHOWN + 8)
      .p(4)
      .gap(1)
      .overflow_y_scroll()
      .track_scroll(this.scroll)
      .rounded(10)
      .bg(t.popover)
      .border_1()
      .border_color(t.border)
      .shadow_lg()
      .text_size(13)
      .children(items.map(row));
  }
}
