// The copy button that shows while the pointer is on what it copies: code
// blocks, your messages, answers, errors.

import { div } from "gpui-kit";
import { TextView, v_flex } from "gpui-base";
import { icon } from "./ui.js";

/**
 * Makes `el` the area whose hover shows the copy button `id`.
 * @param {{ hovered: Set<string> }} pointer The view's pointer state: the areas the pointer is in (one inside another).
 */
export function hoverArea(el, id, pointer) {
  return el.id(`${id}-area`).on_hover((hovered, cx) => {
    if (hovered === pointer.hovered.has(id)) return;
    if (hovered) pointer.hovered.add(id);
    else pointer.hovered.delete(id);
    cx.notify();
  });
}

/**
 * The button; it takes its room even while hidden, so nothing moves when it shows.
 * @param {Record<string, string>} t The theme.
 * @param {{ hovered: Set<string>, copied: string|null, copy: (id: string, text: string, cx: object) => void }} pointer
 */
export function copyButton(t, id, text, pointer, label = "Copy") {
  const copied = pointer.copied === id;
  // The button keeps itself shown: it may hang outside its area (an answer's, in the margin).
  const key = `${id}:button`;
  const shows = pointer.hovered.has(id) || pointer.hovered.has(key) || copied;
  const button = hoverArea(div(), key, pointer).size(26).flex_none().flex().items_center().justify_center().rounded(7);
  if (!shows) return button;
  return button
    .cursor_pointer()
    .bg(t.surface)
    .border_1()
    .border_color(t.border)
    .text_color(copied ? t.foreground : t.muted)
    .hover((s) => s.text_color(t.foreground))
    .tooltip(copied ? "Copied" : label)
    .accessibility_label(label)
    .on_click((_event, cx) => pointer.copy(id, text, cx))
    .child(icon(copied ? "check" : "copy", 14));
}

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

/**
 * Text as typed, selectable: one TextView per line, since the TextView drops
 * `<br>` and markdown's escapes. Leading spaces are kept. A selection stays
 * within a line; the copy button copies all of it.
 * @param {string} id
 * @param {string} text
 */
export function typedText(id, text) {
  return v_flex().children(
    text.split("\n").map((line, index) => {
      const html = line.replace(/[&<>"]/g, (c) => ESCAPES[c]).replace(/^ +/, (spaces) => "&nbsp;".repeat(spaces.length)) || "&nbsp;";
      return TextView.html(`${id}-${index}`, `<p>${html}</p>`).selectable(true);
    }),
  );
}
