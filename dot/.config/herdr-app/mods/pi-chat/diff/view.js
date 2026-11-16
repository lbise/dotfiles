// A diff drawn as rows: each its sign and line number, its tint, and its text in
// syntax colours (highlight.js). Only the rows in view are built.
//
// The view scrolls itself rather than being a GPUI scroll area: a scroll area
// gives the wheel to the chat's scroller as well (both move), and a script can
// not tell whether it is at its end. Here the wheel stays in the view while it
// moves the view, and goes on to the chat once the view is at its end.

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { settings } from "herdr";
import { MONO, codeFont, mix, monoLine } from "../ui.js";
import { highlightRows } from "./highlight.js";
import { markSpans, wordMarks } from "./words.js";

/** A row's height. */
export const DIFF_ROW = 20;
const GUTTER = 44; // the sign and line number
const TEXT_END = 12; // room after the longest line
const CHAR_GUESS = 7.5; // a character's width until one is measured
const KEPT = 64;
const SIGN = { add: "+", del: "−", same: "", gap: "" };

/**
 * @typedef {{ kind: "add"|"del"|"same"|"gap", number: string, text: string }} DiffRow
 *
 * @typedef {object} DiffView One diff on screen: its rows and colours, and where it is scrolled.
 * @property {string} id
 * @property {string} key What its rows were made from.
 * @property {DiffRow[]} rows
 * @property {import("./highlight.js").Span[][]|null} spans Null: plain text.
 * @property {Array<[number, number][]|null>} marks Changed words, per row (words.js).
 * @property {number} columns The longest line, in characters.
 * @property {number} y Scrolled down, design px.
 * @property {number} x Scrolled sideways, design px.
 * @property {number} width The text's room, design px; 0 until laid out.
 */

export class DiffViews {
  constructor() {
    /** @type {Map<string, DiffView>} */
    this.views = new Map();
    this.char = 0; // a code character's width, design px, once measured
  }

  /**
   * The view `id`, its rows made by `rows()` when `key` (what they are made from) changed.
   * It keeps where it was scrolled.
   * @param {string} id
   * @param {string} key
   * @param {string|null} language A Prism language (highlight.js languageOf).
   * @param {() => DiffRow[]} rows
   * @returns {DiffView}
   */
  view(id, key, language, rows) {
    let view = this.views.get(id);
    if (!view || view.key !== key) {
      const made = rows();
      view = {
        id,
        key,
        rows: made,
        spans: highlightRows(made, language),
        marks: wordMarks(made),
        columns: made.reduce((most, row) => Math.max(most, row.text.replace(/\t/g, "    ").length), 0),
        y: view ? view.y : 0,
        x: view ? view.x : 0,
        width: view ? view.width : 0,
      };
    }
    // Kept in the order last drawn: the views not drawn for longest go first.
    this.views.delete(id);
    this.views.set(id, view);
    for (const old of [...this.views.keys()].slice(0, Math.max(0, this.views.size - KEPT))) this.views.delete(old);
    return view;
  }

  /**
   * The view, `height` tall (its rows and `pad` above and below them).
   * @param {Record<string, string>} t The theme.
   * @param {Record<string, string>} colours A colour per span kind; a kind without one is drawn in the foreground.
   * @param {DiffView} view
   * @param {{ height: number, pad: number }} size
   */
  draw(t, colours, view, { height, pad }) {
    const zoom = settings().zoom || 1;
    const inner = height - pad * 2;
    const maxY = Math.max(0, view.rows.length * DIFF_ROW - inner);
    const maxX = view.width ? Math.max(0, view.columns * (this.char || CHAR_GUESS) + TEXT_END - view.width) : 0;
    view.y = clamp(view.y, maxY);
    view.x = clamp(view.x, maxX);
    const first = Math.floor(view.y / DIFF_ROW);
    const last = Math.min(view.rows.length, Math.ceil((view.y + inner) / DIFF_ROW));
    const tint = { add: mix(t.background, t.ansi2, 0.16), del: mix(t.background, t.ansi1, 0.16) };
    tint.mark = { add: mix(t.background, t.ansi2, 0.38), del: mix(t.background, t.ansi1, 0.38) };
    const rows = [];
    for (let i = first; i < last; i++) rows.push(this.row(t, colours, tint, view, i, i === first, zoom));
    return div()
      .id(`${view.id}-view`)
      .relative()
      .w_full()
      .h(height)
      .overflow_hidden()
      .font_family(codeFont())
      .text_size(12.5)
      .text_color(t.foreground)
      .on_size_change((size, cx) => {
        const width = size.width / zoom - GUTTER;
        if (Math.abs(width - view.width) < 0.5) return;
        view.width = width;
        cx.notify();
      })
      .on_scroll_wheel((event, cx) => {
        let dx = event.delta.x / zoom;
        let dy = event.delta.y / zoom;
        if (event.modifiers.shift && !dx) [dx, dy] = [dy, 0];
        const y = clamp(view.y - dy, maxY);
        const x = clamp(view.x - dx, maxX);
        // At its end the view lets the wheel go on: the chat scrolls instead.
        if (Math.abs(y - view.y) < 0.01 && Math.abs(x - view.x) < 0.01) return;
        view.y = y;
        view.x = x;
        cx.stop_propagation();
        cx.notify();
      })
      .child(v_flex().absolute().left(0).right(0).top(pad + first * DIFF_ROW - view.y).children(rows))
      .when(maxY > 0, (el) => {
        const size = Math.max(20, (inner * inner) / (inner + maxY));
        return el.child(div().absolute().right(3).top(pad + ((inner - size) * view.y) / maxY).w(4).h(size).rounded(2).bg(t.border));
      })
      .when(maxX > 0, (el) => {
        const room = Math.max(1, view.width);
        const size = Math.max(20, (room * room) / (room + maxX));
        return el.child(div().absolute().bottom(2).left(GUTTER + ((room - size) * view.x) / maxX).h(4).w(size).rounded(2).bg(t.border));
      });
  }

  row(t, colours, tint, view, index, first, zoom) {
    const row = view.rows[index];
    const spans = markSpans(view.spans ? view.spans[index] : [{ text: row.text, kind: null }], view.marks[index]);
    const text = h_flex()
      .absolute()
      .top(0)
      .h(DIFF_ROW)
      .left(-view.x)
      .whitespace_nowrap()
      .children(spans.map((span) => div().flex_none().when(Boolean(span.kind && colours[span.kind]), (el) => el.text_color(colours[span.kind])).when(span.mark, (el) => el.bg(tint.mark[row.kind])).child(monoLine(span.text))));
    // The first row on screen measures a character, once: the font is the same in every view.
    const columns = row.text.replace(/\t/g, "    ").length;
    const measures = first && !this.char && columns >= 8;
    return h_flex()
      .h(DIFF_ROW)
      .flex_none()
      .when(Boolean(tint[row.kind]), (el) => el.bg(tint[row.kind]))
      .child(
        h_flex()
          .w(GUTTER)
          .flex_none()
          .pr(8)
          .justify_end()
          .font_family(MONO)
          .text_size(11)
          .text_color(row.kind === "add" ? t.ansi2 : row.kind === "del" ? t.ansi1 : t.dim)
          .child(row.kind === "gap" ? "⋯" : `${SIGN[row.kind]}${row.number}`),
      )
      .child(
        div()
          .relative()
          .flex_1()
          .min_w(0)
          .h(DIFF_ROW)
          .overflow_hidden()
          .child(
            measures
              ? text.id(`${view.id}-measure`).on_size_change((size, cx) => {
                  if (this.char) return;
                  this.char = size.width / zoom / columns;
                  cx.notify();
                })
              : text,
          ),
      );
  }
}

function clamp(value, max) {
  return Math.max(0, Math.min(value, max));
}
