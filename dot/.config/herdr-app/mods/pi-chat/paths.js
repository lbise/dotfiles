// The path menu: Tab on a path before the caret in the reply box lists the files and
// folders it could become, over the box. Typing on filters the list; ↑↓ choose,
// Enter or Tab take the chosen one (a folder lists its own next), Esc closes.

import { div } from "gpui-kit";
import { ScrollHandle, h_flex, v_flex } from "gpui-base";
import { pathChoices } from "./model/lists.js";
import { mix } from "./ui.js";

const ROW = 30;
const SHOWN = 9;

export class PathMenu {
  constructor() {
    this.found = []; // what the last Tab listed
    this.items = []; // those the typed path still starts
    this.index = 0;
    this.scroll = ScrollHandle.new();
  }

  /** Opens on what a Tab listed. */
  show(found, text) {
    this.found = found;
    this.index = 0;
    this.scroll.scroll_to_item(0);
    this.follow(text);
  }

  /** Follows the reply box: filters, and closes once nothing matches. */
  follow(text) {
    if (!this.found.length) return;
    this.items = pathChoices(this.found, text);
    if (!this.items.length) this.close();
    else this.move(0);
  }

  close() {
    this.found = [];
    this.items = [];
  }

  isOpen() {
    return this.items.length > 0;
  }

  chosen() {
    return this.items[this.index];
  }

  move(by) {
    this.index = Math.max(0, Math.min(this.items.length - 1, this.index + by));
    this.scroll.scroll_to_item(this.index);
  }

  /**
   * The menu's content, or null when closed.
   * @param {Record<string, string>} t The theme.
   * @param {{ width: number, accept: (path: string, cx: object) => void, hover: (index: number, cx: object) => void }} options
   */
  render(t, { width, accept, hover }) {
    if (!this.items.length) return null;
    const row = (path, index) => {
      const on = index === this.index;
      const folder = path.endsWith("/");
      return h_flex()
        .id(`pi-chat-path-${index}`)
        .h(ROW)
        .px(8)
        .gap(10)
        .flex_none()
        .items_center()
        .rounded(6)
        .cursor_pointer()
        .when(on, (el) => el.bg(mix(t.hover, t.foreground, 0.06)))
        .on_click((_event, cx) => accept(path, cx))
        .on_hover((over, cx) => {
          if (over && !on) hover(index, cx);
        })
        .child(div().flex_1().min_w(0).truncate().font_family("Geist Mono").text_color(t.foreground).child(path.replace(/.*\/(?=.)/, "")))
        .child(div().flex_none().text_size(12).text_color(t.muted).child(folder ? "folder" : "file"));
    };
    return v_flex()
      .id("pi-chat-paths")
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
      .children(this.items.map(row));
  }
}
