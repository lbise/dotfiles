// An answer: markdown in the reading font, its code blocks in the terminal font
// with a copy button that shows while the pointer is on the block.

import { div } from "gpui-kit";
import { Editor, TextView, v_flex } from "gpui-base";
import { copyButton, hoverArea } from "./copy.js";
import { codeFont, mix, monoLine } from "./ui.js";

const FENCE = /```([^\n`]*)\n([\s\S]*?)(?:\n```|$)/g;
// Pi shows an answer's lines as written; markdown would join them. Two spaces
// before a line end keep the break.
const SOFT_BREAK = /([^\n])\n(?=[^\n])/g;
const LINE = 20; // a code line, px
/** The text split at its fenced code blocks; a fence still being written runs to the end. */
function blocks(text) {
  const parts = [];
  let at = 0;
  for (const match of text.matchAll(FENCE)) {
    const before = text.slice(at, match.index).trim();
    if (before) parts.push({ code: false, text: before });
    parts.push({ code: true, text: match[2], info: match[1].trim().split(/\s+/)[0].toLowerCase() });
    at = match.index + match[0].length;
  }
  const rest = text.slice(at).trim();
  if (rest) parts.push({ code: false, text: rest });
  return parts;
}

function codeBlock(t, id, code, info, pointer, views) {
  const view = views.view(id, code, info);
  const lines = code.split("\n");
  return hoverArea(div(), id, pointer)
    .relative()
    .w_full()
    .rounded(10)
    .border_1()
    .border_color(t.border)
    .bg(mix(t.background, t.surface, 0.5))
    .child(
      view
        ? div().px(14).py(12).child(Editor.new(view).w_full().h(lines.length * LINE))
        : v_flex()
            .id(`${id}-text`)
            .px(14)
            .py(12)
            .overflow_x_scroll()
            .font_family(codeFont())
            .text_size(12.5)
            .line_height(LINE / 12.5)
            .text_color(t.foreground)
            .children(lines.map((line) => div().flex_none().whitespace_nowrap().child(monoLine(line)))),
    )
    .child(div().absolute().top(8).right(8).child(copyButton(t, id, code, pointer, "Copy the code")));
}

/**
 * @param {Record<string, string>} t The theme.
 * @param {string} id Unique and stable for this text.
 * @param {string} text Markdown.
 * @param {{ hovered: Set<string>, copied: string|null, copy: (id: string, code: string, cx: object) => void }} pointer
 * @param {import("./code.js").CodeViews} views
 */
export function markdown(t, id, text, pointer, views) {
  const parts = blocks(text).map((part, index) =>
    part.code ? codeBlock(t, `${id}-code-${index}`, part.text, part.info, pointer, views) : TextView.markdown(`${id}-text-${index}`, part.text.replace(SOFT_BREAK, "$1  \n")).selectable(true),
  );
  return v_flex().w_full().gap(12).text_size(15).line_height(1.6).text_color(t.foreground).children(parts);
}
