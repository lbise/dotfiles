// The header of a Pi pane, the same in the chat and over its terminal: the Pi
// mark, the session's title, where it runs, then whatever the view adds at the
// right (the chat its settings button, the terminal its pane buttons) and the switch.

import { div, image, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { shortFolder } from "./ui.js";

export const HEADER_HEIGHT = 46;

function mark(t, program) {
  const glyph = !program || !program.icon ? null : program.tint ? svg(program.icon).size(13).text_color(t.foreground) : image(program.icon).size(13);
  return div().size(22).flex_none().flex().items_center().justify_center().rounded(6).bg(t.surface).when(glyph, (el) => el.child(glyph));
}

/**
 * @param {Record<string, string>} t The theme.
 * @param {object} pi The pane, from view.js.
 * @param {string|import("gpui-kit").Element} title The session's title, or "", or what stands in its place.
 * @param {import("gpui-kit").Element[]} trailing What stands at the right.
 */
export function piHeader(t, pi, title, trailing) {
  const where = [pi.machine, shortFolder(pi.cwd)].filter(Boolean).join(" · ");
  return h_flex()
    .size_full()
    .px(14)
    .gap(10)
    .items_center()
    .bg(t.background)
    .border_b(1)
    .border_color(t.border)
    .text_size(13)
    .text_color(t.foreground)
    .child(mark(t, pi.program))
    .child(div().flex_none().font_semibold().child("Pi"))
    .when(title, (el) => el.child(typeof title === "string" ? div().flex_shrink(1).min_w(0).truncate().font_medium().child(title) : title))
    .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(where))
    .children(trailing);
}

/** A 28 px icon button for a header. */
export function headerButton(t, id, glyph, label, on, press) {
  return div()
    .id(id)
    .size(28)
    .flex_none()
    .flex()
    .items_center()
    .justify_center()
    .rounded(7)
    .cursor_pointer()
    .text_color(on ? t.foreground : t.muted)
    .when(on, (el) => el.bg(t.surface))
    .hover((s) => s.bg(t.surface).text_color(t.foreground))
    .when(!on, (el) => el.tooltip(label))
    .accessibility_label(label)
    .on_mouse_down("left", (_event, cx) => cx.stop_propagation())
    .on_click((_event, cx) => {
      cx.stop_propagation();
      press(cx);
    })
    .child(glyph);
}
