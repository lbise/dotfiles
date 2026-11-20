// An answer: markdown in the reading font, its code blocks in the terminal font
// with a copy button that shows while the pointer is on the block.

import { div } from "gpui-kit";
import { Editor, TextView, v_flex } from "gpui-base";
import { copyButton, hoverArea } from "./copy.js";
import { codeFont, mix, monoLine } from "./ui.js";
import { wrappedRows } from "./model/wrap.js";
import { blocks } from "./model/fences.js";

// Pi shows an answer's lines as written; markdown would join them. Two spaces
// before a line end keep the break.
const SOFT_BREAK = /([^\n])\n(?=[^\n])/g;
const LINE = 20; // a code line, px
const CHAR = 7.6; // a code character at 12.5 px, as steps.js
const ROOM = 56; // a block's border and padding across, and the code view's own right margin, px

function codeBlock(t, id, code, info, pointer, views, width) {
  // Long lines wrap: the block is as tall as its code and never scrolls itself.
  const view = views.view(id, code, info, true);
  const lines = code.split("\n");
  // shortcut: rows guessed from a fixed character width, measure the font if blocks clip.
  const perLine = Math.max(20, Math.floor((width - ROOM) / CHAR) - 1);
  const height = lines.reduce((sum, line) => sum + wrappedRows(line, perLine), 0) * LINE;
  return hoverArea(div(), id, pointer)
    .relative()
    .w_full()
    .rounded(10)
    .border_1()
    .border_color(t.border)
    .bg(mix(t.background, t.surface, 0.5))
    .child(
      view
        ? div().px(14).py(12).child(Editor.new(view).w_full().h(height))
        : v_flex()
            .px(14)
            .py(12)
            .h(height + 24)
            .overflow_hidden()
            .font_family(codeFont())
            .text_size(12.5)
            .line_height(LINE / 12.5)
            .text_color(t.foreground)
            .children(lines.map((line) => div().flex_none().child(monoLine(line)))),
    )
    // The code view would take the wheel and scroll past its end: the chat scrolls instead.
    .child(
      div()
        .absolute()
        .inset_0()
        .on_scroll_wheel((event, cx) => {
          cx.stop_propagation();
          pointer.wheel(event, cx);
        }),
    )
    .child(div().absolute().top(8).right(8).child(copyButton(t, id, code, pointer, "Copy the code")));
}

/**
 * @param {Record<string, string>} t The theme.
 * @param {string} id Unique and stable for this text.
 * @param {string} text Markdown.
 * @param {{ hovered: Set<string>, copied: string|null, copy: (id: string, code: string, cx: object) => void, wheel: (event: object, cx: object) => void }} pointer
 * @param {import("./code.js").CodeViews} views
 * @param {number} width The width it is drawn at.
 */
export function markdown(t, id, text, pointer, views, width) {
  const parts = blocks(text).map((part, index) =>
    part.code ? codeBlock(t, `${id}-code-${index}`, part.text, part.info, pointer, views, width) : TextView.markdown(`${id}-text-${index}`, part.text.replace(SOFT_BREAK, "$1  \n")).selectable(true),
  );
  return v_flex().w_full().gap(12).text_size(15).line_height(1.6).text_color(t.foreground).children(parts);
}
