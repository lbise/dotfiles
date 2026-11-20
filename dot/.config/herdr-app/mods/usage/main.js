// Usage: Pi's tokens and cost, from the session logs on every machine.
// collect.py runs on each machine (python3) and returns per-day totals; the view
// filters them by range, provider and machine, charts them per day, and groups
// them by model, provider, machine or project (History). The Subscriptions tab
// shows each subscription's current limits (subs.mjs, through Pi's usage extension). "This computer"
// counts on Linux; on Windows it is left out: Pi runs only on the Linux machines (WSL is one).
// A side panel (layouts/leo.json's
// `usage` block), opened from the Usage button in the tab bar or leo-tabs.usage,
// maximized with leo-tabs.max (mods/leo-tabs). Below WIDE it lays itself out for
// the narrow panel: fewer table columns, stacked controls. Keyboard: see HELP.
// shortcut: the machine and provider chips are mouse only; give them keys if they get flipped often.

import { View, div, svg } from "gpui-kit";
import { ScrollHandle, h_flex, v_flex } from "gpui-base";
import { appHome, exec, layout, machines, nextCommand, readTextFile, run, settings, theme } from "herdr";
import { usageChart, seriesColor } from "./chart.js";
import {
  CREDIT_USD, GROUPS, LOCAL, OTHER, RANGES, billing, breakdownOf, formatBucket, formatCost, formatSpan, formatTokens, since, summarize,
  onOf, toRecords, tokens,
} from "./model.js";
import { loadSubs, subsView } from "./subs-view.js";

const MONO = "Geist Mono";
const TIMEOUT_MS = 120000;
const COLUMNS = [
  ["messages", "Msgs"],
  ["input", "Input"],
  ["cacheRead", "Cached in"],
  ["cacheWrite", "Cache write"],
  ["output", "Output"],
  ["cost", "Cost"],
];
const NARROW_COLUMNS = [
  ["tokens", "Tokens"],
  ["cost", "Cost"],
];
const COLUMN_WIDTH = 96;
const NARROW_COLUMN_WIDTH = 72;
const WIDE = 760; // design px from which the full layout shows
const HELP = ["t history/subscriptions", "1-4 range", "g/G group", "c cost/tokens", "j/k row", "enter/o open row",
  "h/l day", "esc clear day", "r refresh", "m maximize", "q close", "? keys"];

function findNode(node, id) {
  if (!node) return null;
  if (node.id === id) return node;
  for (const child of node.children || []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

/** The maximize button every side panel has (leo-tabs does the work). */
function maxButton(t) {
  const max = findNode(layout(), "chat-view")?.hidden === true;
  return h_flex().id("panel-max").size(26).flex_none().items_center().justify_center().rounded(6).border(1).border_color(t.border)
    .text_color(t.muted).cursor_pointer().hover((s) => s.bg(t.raised).text_color(t.foreground))
    .on_click(() => run("leo-tabs.max"))
    .child(svg(`mods/review/icons/${max ? "unzoom" : "zoom"}.svg`).size(14));
}

export default class Usage extends View {
  init(_given, cx) {
    this.width = 0; // design px
    this.handle = cx.focus_handle();
    this.part = new Report(cx);
    // "focus": leo-tabs showed the panel, or pane.go moved here (mod.json "focusable").
    cx.spawn(async (cx) => {
      for (;;) {
        if ((await nextCommand()) === "focus") this.handle.focus();
        cx.notify();
      }
    });
  }

  render(cx) {
    return v_flex().id("usage-root").size_full()
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.modifiers.control || e.modifiers.alt || e.modifiers.platform) return;
        if (this.part.key(e.key_char && e.key_char.trim() ? e.key_char : e.key, cx)) { cx.stop_propagation(); cx.notify(); }
      })
      .on_size_change((size, cx) => {
        const width = size.width / (settings().zoom || 1);
        if (Math.abs(width - this.width) < 1) return;
        this.width = width;
        cx.notify();
      })
      .child(this.part.render(this.width < WIDE, this.handle.is_focused()));
  }
}

const TABS = [
  ["history", "History"],
  ["subs", "Subscriptions"],
];

class Report {
  constructor(cx) {
    this.tab = "history";
    this.subs = { state: "idle", providers: [], errors: [], at: 0 };
    this.range = "30d";
    this.group = "model";
    this.metric = "cost";
    this.off = new Set(); // "p:<provider>", "m:<machine>" left out
    this.bucket = ""; // the chart bar picked
    this.pointed = ""; // the chart bar under the pointer
    this.open = new Set(); // table rows opened into their breakdown
    this.at = 0; // the table row the keyboard is on
    this.rowKeys = []; // the table's rows and the chart's bars, as last drawn
    this.barKeys = [];
    this.help = false;
    this.scroll = ScrollHandle.new();
    this.results = {}; // machine -> { state: "loading" | "ok" | "error", records, error }
    this.refresh(cx);
  }

  refresh(cx) {
    const names = piMachines();
    this.results = Object.fromEntries(names.map((name) => [name, { state: "loading", records: [] }]));
    cx.notify();
    cx.spawn(async (cx) => {
      const script = await readTextFile(`${appHome()}/mods/usage/collect.py`);
      await Promise.all(names.map(async (name) => {
        this.results[name] = await collect(name, script);
        cx.notify();
      }));
    });
  }

  refreshSubs(cx) {
    this.subs = { ...this.subs, state: "loading" };
    cx.notify();
    cx.spawn(async (cx) => {
      const script = await readTextFile(`${appHome()}/mods/usage/subs.mjs`);
      const names = piMachines().sort();
      this.subs = { state: "ok", ...(await loadSubs(names, script)), at: Date.now() };
      cx.notify();
    });
  }

  set(field, value, cx) {
    this[field] = value;
    if (field === "tab" && value === "subs" && this.subs.state === "idle") this.refreshSubs(cx);
    if (field === "range") this.bucket = "";
    if (field === "group") this.open.clear();
    cx.notify();
  }

  /** A key on the focused panel (`name`: the character typed, else the key's name); true when taken. */
  key(name, cx) {
    const history = this.tab === "history";
    const cycle = (list, now, by) => list[(list.findIndex(([key]) => key === now) + by + list.length) % list.length][0];
    const range = RANGES[Number(name) - 1];
    if (name === "t") this.set("tab", history ? "subs" : "history", cx);
    else if (name === "r") history ? this.refresh(cx) : this.refreshSubs(cx);
    else if (name === "m") run("leo-tabs.max");
    else if (name === "q") run("leo-tabs.usage");
    else if (name === "?") this.help = !this.help;
    else if (!history) return false;
    else if (range) this.set("range", range[0], cx);
    else if (name === "g" || name === "G") this.set("group", cycle(GROUPS, this.group, name === "g" ? 1 : -1), cx);
    else if (name === "c") this.set("metric", this.metric === "cost" ? "tokens" : "cost", cx);
    else if (name === "j" || name === "k" || name === "down" || name === "up") {
      this.at = Math.max(0, Math.min(this.rowKeys.length - 1, this.at + (name === "j" || name === "down" ? 1 : -1)));
      this.scroll.scroll_to_item(2); // the table's card
    } else if (name === "enter" || name === "o" || name === "space") {
      if (this.rowKeys[this.at]) this.flip(this.open, this.rowKeys[this.at], cx);
    } else if (name === "h" || name === "l") {
      const bars = this.barKeys, at = bars.indexOf(this.bucket);
      const next = at < 0 ? (name === "h" ? bars.length - 1 : 0) : Math.max(0, Math.min(bars.length - 1, at + (name === "h" ? -1 : 1)));
      if (bars[next]) this.bucket = bars[next];
    } else if (name === "escape" && this.bucket) this.set("bucket", "", cx);
    else return false;
    return true;
  }

  // Ctrl-click passes the chip's row: only this one stays on, or all again if it already was.
  flip(set, key, cx, row) {
    const solo = row && row.every((k) => (k === key) !== set.has(k));
    if (row) for (const k of row) solo || k === key ? set.delete(k) : set.add(k);
    else if (set.has(key)) set.delete(key);
    else set.add(key);
    cx.notify();
  }

  render(narrow, focused) {
    const t = theme();
    const records = Object.values(this.results).flatMap((r) => r.records);
    const sum = summarize(records, { from: since(this.range), off: this.off, group: this.group, metric: this.metric, bucket: this.bucket });
    this.rowKeys = sum.groups.map((g) => g.key);
    this.barKeys = sum.chart.bars.map((b) => b.key);
    this.at = Math.max(0, Math.min(this.at, this.rowKeys.length - 1));
    const history = this.tab === "history";
    const loading = history ? Object.values(this.results).some((r) => r.state === "loading") : this.subs.state === "loading";
    const format = this.metric === "tokens" ? formatTokens : formatCost;
    const names = new Map(sum.groups.map((g) => [g.key, g.note ? `${g.name} (${g.note})` : g.name]));
    // A picked bar narrows the table; series names come from the whole range.
    const nameOf = (key) => names.get(key) || (key === OTHER ? OTHER : key.split("\u0000").pop());

    const segments = (id, options, current, field) => h_flex().gap(4).children(options.map(([key, text]) =>
      h_flex().id(`${id}-${key}`).h(26).px(10).items_center().rounded(6).border(1).cursor_pointer().flex_none()
        .border_color(current === key ? t.accent : t.border)
        .text_color(current === key ? t.foreground : t.muted)
        .hover((s) => s.bg(t.raised))
        .on_click((_e, cx) => this.set(field, key, cx))
        .child(text)));

    const chipRows = { m: Object.keys(this.results).map((name) => `m:${name}`), p: sum.providers.map((p) => p.key) };
    const chip = (key, label, figure, extra) => {
      const on = !this.off.has(key);
      return h_flex().id(key).h(26).px(9).gap(6).items_center().rounded(7).border(1).flex_none()
        .border_color(on ? t.input : t.border).text_color(on ? t.foreground : t.dim)
        .cursor_pointer().hover((s) => s.bg(t.raised))
        .on_click((e, cx) => this.flip(this.off, key, cx, e.modifiers.control && chipRows[key[0]]))
        .child(label)
        .when(figure !== null, (el) => el.child(div().font_family(MONO).text_size(12).text_color(on ? t.muted : t.dim).child(figure)))
        .when(!!extra, (el) => el.child(extra));
    };

    const machineChip = (name) => {
      const r = this.results[name];
      const status = r.state === "loading"
        ? div().text_color(t.muted).frames(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"], 90)
        : r.state === "error" ? div().max_w(260).truncate().text_color(t.ansi1).child(r.error) : null;
      const figures = sum.machines.find((m) => m.name === name);
      return chip(`m:${name}`, name, r.state === "ok" ? formatCost(figures ? figures.cost : 0) : null, status);
    };

    const providerChip = (p) => {
      const kind = billing(p.name);
      const figure = kind === "credits" ? `${formatCost(p.cost)} · ${formatTokens(p.credits)} cr` : formatCost(p.cost);
      const tag = div().text_size(11).text_color(t.dim).child(kind === "subscription" ? "sub" : kind === "credits" ? "credits" : "metered");
      return chip(p.key, p.name, figure, tag);
    };

    const label = (text) => div().when(narrow, (el) => el.w_full()).when(!narrow, (el) => el.w(76)).flex_none().text_size(12).text_color(t.muted).child(text);
    const card = () => v_flex().rounded(10).border(1).border_color(t.border);
    const stat = (name, value, note) =>
      v_flex().gap(2).flex_none()
        .child(div().text_size(12).text_color(t.muted).child(name))
        .child(div().font_family(MONO).text_size(18).text_color(t.foreground).child(value))
        .child(div().font_family(MONO).text_size(11).text_color(t.dim).child(note || " "));

    const columns = narrow ? NARROW_COLUMNS : COLUMNS;
    const cell = (text, color) => h_flex().w(narrow ? NARROW_COLUMN_WIDTH : COLUMN_WIDTH).flex_none().justify_end().font_family(MONO).text_size(12).text_color(color).child(text);
    const figures = (g) => columns.map(([key]) => (key === "cost" ? formatCost(g.cost) : formatTokens(key === "tokens" ? tokens(g) : g[key])));
    const nameCell = (g, color, dot) => h_flex().flex_1().min_w(0).gap(8).items_center()
      .child(div().size(8).rounded(2).flex_none().when(!!dot, (el) => el.bg(dot)))
      .child(div().truncate().text_color(color).child(g.name))
      .when(!!g.note, (el) => el.child(div().flex_none().text_size(12).text_color(t.muted).child(g.note)));

    const rows = [];
    for (const [i, g] of sum.groups.entries()) {
      const opened = this.open.has(g.key);
      const dot = sum.chart.series.includes(g.key) ? seriesColor(t, sum.chart.series, g.key) : null;
      rows.push(h_flex().id(`row-${g.key}`).h(30).flex_none().items_center().px(10).border_b(1).border_color(t.border)
        .when(focused && i === this.at, (el) => el.bg(t.selected))
        .cursor_pointer().hover((s) => s.bg(t.raised))
        .on_click((_e, cx) => this.flip(this.open, g.key, cx))
        .child(div().w(14).flex_none().text_color(t.dim).child(opened ? "▾" : "▸"))
        .child(nameCell(g, t.foreground, dot))
        .children(figures(g).map((f) => cell(f, t.foreground))));
      if (!opened) continue;
      for (const p of g.parts) {
        const share = g.cost ? `${Math.round((p.cost / g.cost) * 100)}%` : tokens(g) ? `${Math.round((tokens(p) / tokens(g)) * 100)}%` : "";
        rows.push(h_flex().h(26).flex_none().items_center().px(10).pl(narrow ? 24 : 34).border_b(1).border_color(t.border).bg(t.surface)
          .child(nameCell({ ...p, note: [p.note, share].filter(Boolean).join(" · ") }, t.muted, null))
          .children(figures(p).map((f) => cell(f, t.muted))));
      }
    }

    const groupLabel = GROUPS.find(([key]) => key === this.group)[1].toLowerCase();
    const breakdownLabel = GROUPS.find(([key]) => key === breakdownOf(this.group))[1].toLowerCase();
    const total = sum.total;

    const bucketChip = h_flex().id("bucket-clear").h(24).px(8).gap(6).flex_none().items_center().rounded(6)
      .bg(t.surface).cursor_pointer().hover((s) => s.bg(t.raised))
      .on_click((_e, cx) => this.set("bucket", "", cx))
      .child(div().font_family(MONO).text_size(12).child(formatBucket(this.bucket, sum.chart.weekly)))
      .child(div().text_color(t.muted).child("×"));
    const span = div().pr(4).font_family(MONO).text_size(12).text_color(t.muted).child(formatSpan(sum.span));
    const refresh = h_flex().id("refresh").h(26).px(narrow ? 6 : 10).flex_none().items_center().rounded(6).border(1).border_color(t.border)
      .text_color(loading ? t.dim : t.muted).cursor_pointer().hover((s) => s.bg(t.raised).text_color(t.foreground))
      .on_click((_e, cx) => { if (!loading) (history ? this.refresh(cx) : this.refreshSubs(cx)); })
      .child(narrow ? svg("mods/review/icons/refresh.svg").size(14) : "Refresh");
    // Narrow: the panel's tab already says Usage; the range goes on its own line.
    const header = narrow
      ? v_flex().gap(8)
        .child(h_flex().items_center().gap(6)
          .child(segments("tab", TABS, this.tab, "tab"))
          .child(div().flex_1())
          .child(refresh)
          .child(maxButton(t)))
        .when(history, (el) => el.child(h_flex().items_center().gap(6).flex_wrap()
          .child(segments("range", RANGES, this.range, "range").flex_wrap())
          .child(span)
          .when(!!this.bucket, (el) => el.child(bucketChip))))
      : h_flex().items_center().gap(8)
        .child(div().font_semibold().pr(6).child("Usage"))
        .child(segments("tab", TABS, this.tab, "tab"))
        .when(history && !!this.bucket, (el) => el.child(bucketChip))
        .child(div().flex_1())
        .when(history, (el) => el.child(span).child(segments("range", RANGES, this.range, "range")))
        .child(refresh)
        .child(maxButton(t));

    return v_flex().id("usage").size_full().bg(t.background).text_color(t.foreground).text_size(13).p(narrow ? 12 : 18).gap(narrow ? 12 : 14)
      .rounded(10).border_1().border_color(focused ? t.input : t.border).overflow_hidden()
      .child(header)
      .when(this.help, (el) => el.child(div().text_size(11).text_color(t.muted).whitespace_normal().child(HELP.join(" · "))))
      .when(!history, (el) => el.child(v_flex().id("subs").flex_1().min_h(0).overflow_y_scrollbar()
        .child(subsView(t, this.subs, this.notes(records), narrow))))
      .when(history, (el) => el.child(h_flex().items_center().gap(6).flex_wrap()
        .child(label("Machines"))
        .children(Object.keys(this.results).sort().map(machineChip))
        .when(!Object.keys(this.results).length, (el) => el.child(div().text_color(t.muted).child("No machines")))))
      .when(history, (el) => el.child(h_flex().items_center().gap(6).flex_wrap()
        .child(label("Providers"))
        .children(sum.providers.map(providerChip))
        .when(!sum.providers.length, (el) => el.child(div().text_color(t.muted).child(loading ? "Loading…" : "No usage in this range")))))
      .when(history, (el) => el.child(v_flex().id("usage-body").flex_1().min_h(0).gap(14).overflow_y_scrollbar().track_scroll(this.scroll)
        .child(h_flex().flex_wrap().gap_x(narrow ? 24 : 32).gap_y(10)
          .child(stat("Billed", formatCost(total.billed), total.credits ? `${formatTokens(total.credits)} Copilot credits` : ""))
          .child(stat("Subscriptions", formatCost(total.subscription), "API value, already paid"))
          .child(stat("Input", formatTokens(total.input)))
          .child(stat("Cached input", formatTokens(total.cacheRead)))
          .child(stat("Cache write", formatTokens(total.cacheWrite)))
          .child(stat("Output", formatTokens(total.output)))
          .child(stat("Messages", formatTokens(total.messages))))
        .child(card().p(narrow ? 10 : 14).gap(10)
          .child(h_flex().items_center().gap(8)
            .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.muted).child(`${this.metric === "tokens" ? "Tokens" : "Cost"} per ${sum.chart.weekly ? "week" : "day"}, by ${groupLabel}`))
            .child(segments("metric", [["cost", "Cost"], ["tokens", "Tokens"]], this.metric, "metric")))
          .child(usageChart(t, sum.chart, {
            picked: this.bucket, pointed: this.pointed, format, nameOf,
            onPoint: (key, on, cx) => { this.pointed = on ? key : this.pointed === key ? "" : this.pointed; cx.notify(); },
            onPick: (key, cx) => this.set("bucket", this.bucket === key ? "" : key, cx),
          })))
        .child(card()
          .child(h_flex().min_h(40).px(10).py(7).gap(8).items_center().flex_wrap().border_b(1).border_color(t.border)
            .child(div().text_size(12).text_color(t.muted).child("Group by"))
            .child(segments("group", GROUPS, this.group, "group").flex_wrap())
            .when(!narrow, (el) => el.child(div().flex_1())
              .child(div().text_size(12).text_color(t.dim).child(`Click a row for its ${breakdownLabel}s`))))
          .child(h_flex().h(30).flex_none().items_center().px(10).border_b(1).border_color(t.border)
            .child(div().w(14).flex_none())
            .child(div().flex_1().min_w(0).text_size(12).text_color(t.muted).child(GROUPS.find(([key]) => key === this.group)[1]))
            .children(columns.map(([, title]) => cell(title, t.muted))))
          .children(rows)
          .when(!rows.length, (el) => el.child(div().p(14).text_color(t.muted).child(loading ? "Loading…" : "No usage"))))));
  }

  // Under Copilot's limits, what Pi's logs book this month, to check the quota against.
  notes(records) {
    if (Object.values(this.results).some((r) => r.state === "loading")) return {};
    const from = since("month");
    const usd = records.reduce((sum, r) => (r.provider === "github-copilot" && r.day >= from ? sum + r.cost : sum), 0);
    return { "github-copilot": `Pi logged ${formatTokens(usd / CREDIT_USD)} credits (${formatCost(usd)}) since ${formatBucket(from, false)}, on every machine` };
  }
}

// The machines Pi may run on: every one, and this computer unless it is Windows.
function piMachines() {
  const local = !appHome().includes("\\");
  return machines().filter((m) => m.name || local).map((m) => m.name || LOCAL);
}

async function collect(name, script) {
  if (!script) return { state: "error", records: [], error: "collect.py not found" };
  try {
    const r = await exec("python3", ["-c", script], { on: onOf(name), timeout: TIMEOUT_MS });
    if (r.code === 127) return { state: "error", records: [], error: "no python3" };
    if (r.code !== 0) return { state: "error", records: [], error: (r.stderr || `exit ${r.code}`).trim().split("\n").pop() };
    return { state: "ok", records: toRecords(name, JSON.parse(r.stdout).rows) };
  } catch (error) {
    return { state: "error", records: [], error: String(error.message || error).split("\n")[0] };
  }
}
