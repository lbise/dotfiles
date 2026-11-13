// The line along the chat's bottom: the context window as 40 cells, the
// repository and branch, the session's cost, and each usage limit as 10 cells.
// When the pane is narrow the least needed words go first, never the figures.

import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { contextCells, formatCost, formatTokens, usageCells } from "./model/format.js";
import { BAR_CELL, cell, emptyCell, strip, usedColor } from "./cells.js";
import { MONO, icon } from "./ui.js";

const HEIGHT = 34;
const PAD = 14;
const GAP = 10;
const RULE = 9; // a separator with its margins
const CHAR = 7.2; // Geist Mono at 12 px
const ICON = 13;

// A part knows its width, and how soon it goes when room runs out (0: never).
function words(t, text, strong, drop = 0) {
  return { width: text.length * CHAR, drop, draw: () => div().flex_none().when(strong, (el) => el.font_medium().text_color(t.foreground)).child(text) };
}

function bar(t, cells) {
  const draw = () => strip(cells.map((on) => (on ? cell(usedColor(t), BAR_CELL) : emptyCell(t, BAR_CELL))));
  return { width: cells.length * (BAR_CELL.width + 2) - 2, drop: 0, draw };
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
    const group = [{ width: ICON, drop: 0, draw: () => icon("branch", ICON) }, words(t, state.git.root, true)];
    if (state.git.branch) group.push(words(t, state.git.branch, false, 3));
    groups.push(group);
  }
  const cost = formatCost(state.cost);
  if (cost) groups.push([words(t, cost, true)]);
  // A usage text without a percentage (when the limit resets) belongs to the one before it.
  let limit = null;
  for (const entry of Array.isArray(state.usage) ? state.usage : []) {
    const usage = usageCells(entry.text);
    if (usage.percent === null) {
      if (!usage.label) continue;
      if (limit) limit.push(words(t, usage.label, false, 4));
      else groups.push([words(t, usage.label, false, 4)]);
      continue;
    }
    limit = [bar(t, usage.cells), words(t, `${Math.round(usage.percent)}%`, true)];
    if (usage.label) limit.unshift(words(t, usage.label, false));
    if (usage.detail) limit.push(words(t, usage.detail, false, 5));
    groups.push(limit);
  }
  return groups;
}

function widthOf(groups) {
  const parts = groups.reduce((sum, group) => sum + group.length, 0);
  const widths = groups.reduce((sum, group) => sum + group.reduce((inner, part) => inner + part.width, 0), 0);
  const rules = Math.max(0, groups.length - 1);
  return PAD * 2 + widths + rules * RULE + Math.max(0, parts + rules - 1) * GAP;
}

function fit(groups, room) {
  let fitted = groups;
  while (widthOf(fitted) > room) {
    const drop = Math.max(0, ...fitted.flat().map((part) => part.drop));
    if (!drop) break;
    fitted = fitted.map((group) => group.filter((part) => part.drop !== drop)).filter((group) => group.length);
  }
  return fitted;
}

/**
 * @param {Record<string, string>} t The theme.
 * @param {object} state The feed's state.json.
 * @param {number} room The width there is, design px; 0 when not measured yet.
 */
export function statusBar(t, state, room) {
  const groups = room ? fit(groupsOf(t, state), room) : groupsOf(t, state);
  const parts = [];
  groups.forEach((group, index) => {
    if (index) parts.push(div().w(1).h(12).mx(4).flex_none().bg(t.border));
    for (const part of group) parts.push(part.draw());
  });
  return h_flex()
    .h(HEIGHT)
    .w_full()
    .flex_none()
    .px(PAD)
    .gap(GAP)
    .items_center()
    .overflow_hidden()
    .border_t(1)
    .border_color(t.border)
    .font_family(MONO)
    .text_size(12)
    .text_color(t.muted)
    .whitespace_nowrap()
    .children(parts);
}
