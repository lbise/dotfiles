// The cell: one small bar per event. A step of a turn, a 40th of the context
// window, a tenth of a usage limit.

import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { mix } from "./ui.js";

export const STEP_CELL = { width: 7, height: 16 };
export const BAR_CELL = { width: 6, height: 13 };
const GAP = 2;
const RADIUS = 1.5;
const GROW = { duration: 160, easing: "ease-out" };
const PULSE = { from: 0.35, to: 1, period: 1200 };

/** The colour of a step's cell: by what it did, or that it failed. */
export function stepColor(t, step) {
  if (step.ok === false) return t.ansi1;
  if (step.kind === "look") return t.ansi4;
  if (step.kind === "run") return t.ansi5;
  if (step.kind === "edit") return t.ansi3;
  return t.dim;
}

/** The colour of a cell that stands for "used", without a kind. */
export function usedColor(t) {
  return mix(t.foreground, t.background, 0.14);
}

/** A filled cell. */
export function cell(color, size = STEP_CELL) {
  return div().w(size.width).h(size.height).flex_none().rounded(RADIUS).bg(color);
}

/** A cell for something that has not happened: an outline. */
export function emptyCell(t, size = STEP_CELL) {
  return div().w(size.width).h(size.height).flex_none().rounded(RADIUS).border_1().border_color(mix(t.border, t.input, 0.5));
}

/**
 * A step's cell in a strip. `grown` false draws it small, so the next draw
 * scales it in; `running` makes it pulse.
 */
export function stepCell(t, id, step, { grown, running }) {
  const bar = div()
    .id(id)
    .w(STEP_CELL.width)
    .h(grown ? STEP_CELL.height : 2)
    .rounded(RADIUS)
    .bg(stepColor(t, step))
    .transition("height", GROW)
    .when(running, (el) => el.loop("opacity", PULSE));
  return div().w(STEP_CELL.width).h(STEP_CELL.height).flex_none().flex().items_center().child(bar);
}

/** Cells in a row, 2 px apart. */
export function strip(cells) {
  return h_flex().flex_none().gap(GAP).items_center().children(cells);
}
