// The Chat | Terminal switch, the same in both views' headers.

import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { icon } from "./ui.js";

/**
 * @param {Record<string, string>} t The theme.
 * @param {"chat"|"terminal"} shown
 * @param {(mode: "chat"|"terminal") => void} choose
 */
export function viewSwitch(t, shown, choose) {
  const segment = (mode, glyph, label) => {
    const on = shown === mode;
    return h_flex()
      .id(`pi-chat-switch-${mode}`)
      .h(24)
      .px(10)
      .gap(6)
      .items_center()
      .rounded(6)
      .text_color(on ? t.foreground : t.muted)
      .when(on, (el) => el.bg(t.background))
      .when(!on, (el) =>
        el
          .cursor_pointer()
          .hover((s) => s.text_color(t.foreground))
          .on_click((_event, cx) => {
            cx.stop_propagation();
            choose(mode);
          }),
      )
      .child(icon(glyph))
      .child(div().child(label));
  };
  return h_flex()
    .flex_none()
    .p(2)
    .rounded(8)
    .bg(t.surface)
    .text_size(13)
    .on_mouse_down("left", (_event, cx) => cx.stop_propagation())
    .child(segment("chat", "chat", "Chat"))
    .child(segment("terminal", "terminal", "Terminal"));
}
