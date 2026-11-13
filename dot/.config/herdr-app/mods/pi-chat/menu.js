// A small menu that opens above its trigger: the model and thinking pickers.

import { div } from "gpui-kit";
import { Popup, h_flex, v_flex } from "gpui-base";
import { icon } from "./ui.js";

/**
 * @param {Record<string, string>} t The theme.
 * @param {object} options
 * @param {string} options.id
 * @param {import("gpui-kit").Element} options.trigger
 * @param {boolean} options.open
 * @param {Array<{ key: string, text: string, note?: string, on: boolean }>} options.items `note` stands at the right, for telling two alike apart.
 * @param {(key: string, cx: object) => void} options.pick
 * @param {(cx: object) => void} options.close
 * @param {number} options.width
 */
export function menu(t, { id, trigger, open, items, pick, close, width }) {
  const row = (item) =>
    h_flex()
      .id(`${id}-${item.key}`)
      .h(28)
      .px(8)
      .gap(8)
      .flex_none()
      .items_center()
      .rounded(6)
      .cursor_pointer()
      .text_color(item.on ? t.foreground : t.muted)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_event, cx) => pick(item.key, cx))
      .child(div().w(14).flex_none().when(item.on, (el) => el.child(icon("check", 14))))
      .child(div().flex_1().min_w(0).truncate().child(item.text))
      .when(item.note, (el) => el.child(div().flex_none().text_size(12).text_color(t.muted).child(item.note)));
  return Popup.new(id, trigger)
    .anchor("bottom_left")
    .when(open, (el) =>
      el.content(
        v_flex()
          .id(`${id}-list`)
          .w(width)
          .max_h(320)
          .mb(8)
          .p(4)
          .gap(1)
          .overflow_y_scroll()
          .rounded(10)
          .bg(t.popover)
          .border_1()
          .border_color(t.border)
          .shadow_lg()
          .text_size(13)
          .on_mouse_down_out((_event, cx) => close(cx))
          .children(items.map(row)),
      ),
    );
}
