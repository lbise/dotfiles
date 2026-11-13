// The line along the chat's bottom: the context window as 40 cells, the
// repository and branch, the session's cost, and each usage limit as 10 cells.
// When the line is too narrow the least needed words go first, never the
// figures. Each version of the line (all words, then fewer) is drawn once out of
// sight and measured, so words go only when they truly do not fit.

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { contextCells, formatCost, formatTokens, usageGroups } from "./model/format.js";
import { BAR_CELL, cell, emptyCell, strip, usedColor } from "./cells.js";
import { MONO, icon } from "./ui.js";

const HEIGHT = 34;
const PAD = 14;
const GAP = 10;
const ICON = 13;
const KEPT = 64;
const OUT_OF_SIGHT = 4000; // room for a version measured unconstrained

// A part: the text its width depends on, how soon it goes when room runs out
// (0: never; the highest goes first), and how to draw it.
function words(t, text, strong, drop = 0, color = null) {
  const draw = () =>
    div()
      .flex_none()
      .when(strong, (el) => el.font_medium().text_color(t.foreground))
      .when(color, (el) => el.text_color(color))
      .child(text);
  return { text, drop, draw };
}

function bar(t, cells, color = null) {
  const draw = () => strip(cells.map((on) => (on ? cell(color || usedColor(t), BAR_CELL) : emptyCell(t, BAR_CELL))));
  return { text: `[${cells.length}]`, drop: 0, draw };
}

// A usage figure that warns, as the terminal footer does: amber from 70 %, rose from 90 %.
function alarmColor(t, tone) {
  return tone === "error" ? t.ansi1 : tone === "warning" ? t.ansi3 : null;
}

function usageParts(t, usage) {
  const parts = [];
  if (usage.label) parts.push(words(t, usage.label, false));
  if (usage.percent === null) parts.push(words(t, usage.value, true));
  else {
    const color = alarmColor(t, usage.tone);
    parts.push(bar(t, usage.cells, color), words(t, `${Math.round(usage.percent)}%`, true, 0, color));
  }
  usage.words.forEach((text, index) => parts.push(words(t, text, false, index ? 4 : 3)));
  if (usage.note) parts.push(words(t, usage.note, true, 3, alarmColor(t, usage.noteTone)));
  if (usage.resets) parts.push(words(t, `resets ${usage.resets}`, false, 5));
  return parts;
}

function groupsOf(t, state) {
  const groups = [];
  const context = state.context;
  if (context && Number.isFinite(context.tokens)) {
    const group = [words(t, "Context", false, 1)];
    if (context.window) group.push(bar(t, contextCells(context).map(Boolean)));
    group.push(words(t, formatTokens(context.tokens), true));
    if (context.window) group.push(words(t, `of ${formatTokens(context.window)}`, false, 2));
    groups.push(group);
  }
  if (state.git) {
    const group = [{ text: "(branch)", drop: 0, draw: () => icon("branch", ICON) }, words(t, state.git.root, true)];
    if (state.git.branch) group.push(words(t, state.git.branch, false, 3));
    groups.push(group);
  }
  const cost = formatCost(state.cost);
  if (cost) groups.push([words(t, cost, true)]);
  for (const usage of usageGroups(state.usage)) groups.push(usageParts(t, usage));
  return groups;
}

// The versions of the line, from all words to only what never goes.
function versions(groups) {
  const drops = [...new Set(groups.flat().map((part) => part.drop).filter(Boolean))].sort((a, b) => b - a);
  return [groups, ...drops.map((drop) => groups.map((group) => group.filter((part) => !part.drop || part.drop < drop)))];
}

// Geist Mono: a word's width is its length.
function signature(groups) {
  return groups.map((group) => group.map((part) => part.text.length).join(" ")).join("|");
}

function line(t, groups) {
  const parts = [];
  groups.forEach((group, index) => {
    if (index) parts.push(div().w(1).h(12).mx(4).flex_none().bg(t.border));
    for (const part of group) parts.push(part.draw());
  });
  return h_flex().h(HEIGHT).flex_none().px(PAD).gap(GAP).items_center().whitespace_nowrap().children(parts);
}

export class StatusBar {
  constructor() {
    this.room = 0; // the line's width, design px; 0 until measured
    this.level = 0; // the version shown last: how many drops
    this.widths = new Map(); // signature -> measured width, design px
  }

  /**
   * @param {Record<string, string>} t The theme.
   * @param {object} state The feed's state.json.
   * @param {number} zoom The app's zoom: measured sizes include it.
   */
  render(t, state, zoom) {
    const all = versions(groupsOf(t, state));
    if (this.widths.size > KEPT) this.widths.clear();
    const unmeasured = all.filter((groups) => !this.widths.has(signature(groups)));
    // Until every version is measured, the line keeps the words it showed last.
    if (!unmeasured.length && this.room) {
      const fits = all.findIndex((groups) => this.widths.get(signature(groups)) <= this.room);
      this.level = fits < 0 ? all.length - 1 : fits;
    }
    const shown = all[Math.min(this.level, all.length - 1)];
    return div()
      .id("pi-chat-status")
      .relative()
      .w_full()
      .flex_none()
      .overflow_hidden()
      .border_t(1)
      .border_color(t.border)
      .font_family(MONO)
      .text_size(12)
      .text_color(t.muted)
      .on_size_change((size, cx) => {
        const room = size.width / zoom;
        if (Math.abs(room - this.room) < 0.5) return;
        this.room = room;
        cx.notify();
      })
      .child(line(t, shown))
      .when(unmeasured.length, (el) =>
        el.child(
          v_flex()
            .absolute()
            .top(0)
            .left(0)
            .w(OUT_OF_SIGHT)
            .items_start()
            .invisible()
            .children(
              unmeasured.map((groups, index) => {
                const key = signature(groups);
                return line(t, groups)
                  .id(`pi-chat-status-measure-${index}`)
                  .on_size_change((size, cx) => {
                    this.widths.set(key, size.width / zoom);
                    cx.notify();
                  });
              }),
            ),
        ),
      );
  }
}
