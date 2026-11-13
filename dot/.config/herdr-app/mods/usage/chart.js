// The usage chart: one stacked bar per day (or week), one colour per series.
// Pointing at a bar names it; a click picks it (again: unpicks).

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { OTHER, formatBucket } from "./model.js";

const HEIGHT = 140;
const MONO = "Geist Mono";

/** Series colours: the terminal's ANSI hues, then grey for Other. */
export function seriesColor(t, series, key) {
  if (key === OTHER) return t.dim;
  const hues = [t.ansi4, t.ansi5, t.ansi3, t.ansi2, t.ansi6, t.ansi1];
  return hues[series.indexOf(key) % hues.length];
}

/**
 * @param {object} t theme
 * @param {{weekly: boolean, bars: {key: string, total: number, parts: Record<string, number>}[], series: string[]}} chart
 * @param {{picked: string, pointed: string, format: (n: number) => string, nameOf: (key: string) => string,
 *   onPoint: (key: string, on: boolean, cx: any) => void, onPick: (key: string, cx: any) => void}} view
 */
export function usageChart(t, chart, view) {
  const max = Math.max(...chart.bars.map((b) => b.total), 0);
  const focus = chart.bars.find((b) => b.key === (view.pointed || view.picked));
  const gap = chart.bars.length > 45 ? 1 : chart.bars.length > 20 ? 2 : 4;
  // Bottom-up: the biggest series sits on the axis.
  const stackOrder = [...chart.series].reverse();

  const bar = (b) => {
    const dimmed = view.picked && view.picked !== b.key;
    return v_flex().id(`bar-${b.key}`).flex_1().min_w(0).h_full().justify_end().cursor_pointer()
      .hover((s) => s.bg(t.raised))
      .on_hover((on, cx) => view.onPoint(b.key, on, cx))
      .on_click((_e, cx) => view.onPick(b.key, cx))
      .when(dimmed, (el) => el.opacity(0.35))
      .children(stackOrder.filter((key) => b.parts[key] > 0).map((key) =>
        div().w_full().flex_none().h(Math.max(1, (b.parts[key] / max) * HEIGHT)).bg(seriesColor(t, chart.series, key))));
  };

  const line = focus
    ? `${formatBucket(focus.key, chart.weekly)} · ${view.format(focus.total)}`
    : `Peak ${view.format(max)}${chart.weekly ? " a week" : " a day"}`;
  const breakdown = focus
    ? chart.series.filter((key) => focus.parts[key] > 0).map((key) =>
      h_flex().gap(5).items_center().flex_none()
        .child(div().size(8).rounded(2).bg(seriesColor(t, chart.series, key)))
        .child(div().text_color(t.muted).child(`${view.nameOf(key)} ${view.format(focus.parts[key])}`)))
    : chart.series.map((key) =>
      h_flex().gap(5).items_center().flex_none()
        .child(div().size(8).rounded(2).bg(seriesColor(t, chart.series, key)))
        .child(div().text_color(t.muted).child(view.nameOf(key))));

  const first = chart.bars[0], last = chart.bars[chart.bars.length - 1];
  return v_flex().gap(8)
    .child(div().font_family(MONO).text_size(12).text_color(focus ? t.foreground : t.muted).child(line))
    .child(h_flex().h(HEIGHT).gap(gap).items_end().border_b(1).border_color(t.border).children(chart.bars.map(bar)))
    .child(h_flex().justify_between().font_family(MONO).text_size(11).text_color(t.dim)
      .child(first ? formatBucket(first.key, chart.weekly) : "")
      .child(last ? formatBucket(last.key, chart.weekly) : ""))
    .child(h_flex().gap(14).flex_wrap().text_size(12).children(breakdown));
}
