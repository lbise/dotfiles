// Usage: Pi's tokens and cost, from the session logs on every machine.
// collect.py runs on each machine (python3) and returns per-day totals; the view
// filters them by range, provider and machine, charts them per day, and groups
// them by model, provider, machine or project (History). The Subscriptions tab
// shows each subscription's current limits (subs.mjs, through Pi's usage extension). "This computer" (Windows) is left
// out: Pi runs only on the Linux machines. Opened with mod.open:usage, or from
// the button this mod draws beside the tab bar (props.role "toggle", layouts/leo.json).

import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { appHome, exec, machines, props, readTextFile, run, theme } from "herdr";
import { usageChart, seriesColor } from "./chart.js";
import {
  CREDIT_USD, GROUPS, OTHER, RANGES, billing, breakdownOf, formatBucket, formatCost, formatSpan, formatTokens, since, summarize,
  toRecords, tokens,
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
const COLUMN_WIDTH = 96;

export default class Usage extends View {
  init(given, cx) {
    this.part = (given || props() || {}).role === "toggle" ? new Toggle() : new Report(cx);
  }

  render(cx) {
    return this.part.render(cx);
  }
}

// The tab bar's button, styled as its Files and Changes buttons.
class Toggle {
  render() {
    const t = theme();
    return h_flex().size_full().px(6).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .child(h_flex().id("usage-open").h(26).px(8).gap(5).flex_none().items_center().rounded(6)
        .text_size(12).text_color(t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click(() => run("mod.open", { name: "usage" }))
        .child(svg("mods/usage/usage.svg").size(14)).child("Usage"));
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
    this.results = {}; // machine -> { state: "loading" | "ok" | "error", records, error }
    this.refresh(cx);
  }

  refresh(cx) {
    const names = machines().map((m) => m.name).filter(Boolean);
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
      const names = machines().map((m) => m.name).filter(Boolean).sort();
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

  flip(set, key, cx) {
    if (set.has(key)) set.delete(key);
    else set.add(key);
    cx.notify();
  }

  render() {
    const t = theme();
    const records = Object.values(this.results).flatMap((r) => r.records);
    const sum = summarize(records, { from: since(this.range), off: this.off, group: this.group, metric: this.metric, bucket: this.bucket });
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

    const chip = (key, label, figure, extra) => {
      const on = !this.off.has(key);
      return h_flex().id(key).h(26).px(9).gap(6).items_center().rounded(7).border(1).flex_none()
        .border_color(on ? t.input : t.border).text_color(on ? t.foreground : t.dim)
        .cursor_pointer().hover((s) => s.bg(t.raised))
        .on_click((_e, cx) => this.flip(this.off, key, cx))
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

    const label = (text) => div().w(76).flex_none().text_size(12).text_color(t.muted).child(text);
    const card = () => v_flex().rounded(10).border(1).border_color(t.border);
    const stat = (name, value, note) =>
      v_flex().gap(2).flex_none()
        .child(div().text_size(12).text_color(t.muted).child(name))
        .child(div().font_family(MONO).text_size(18).text_color(t.foreground).child(value))
        .child(div().font_family(MONO).text_size(11).text_color(t.dim).child(note || " "));

    const cell = (text, color) => h_flex().w(COLUMN_WIDTH).flex_none().justify_end().font_family(MONO).text_size(12).text_color(color).child(text);
    const figures = (g) => COLUMNS.map(([key]) => (key === "cost" ? formatCost(g.cost) : formatTokens(g[key])));
    const nameCell = (g, color, dot) => h_flex().flex_1().min_w(0).gap(8).items_center()
      .child(div().size(8).rounded(2).flex_none().when(!!dot, (el) => el.bg(dot)))
      .child(div().truncate().text_color(color).child(g.name))
      .when(!!g.note, (el) => el.child(div().flex_none().text_size(12).text_color(t.muted).child(g.note)));

    const rows = [];
    for (const g of sum.groups) {
      const opened = this.open.has(g.key);
      const dot = sum.chart.series.includes(g.key) ? seriesColor(t, sum.chart.series, g.key) : null;
      rows.push(h_flex().id(`row-${g.key}`).h(30).flex_none().items_center().px(10).border_b(1).border_color(t.border)
        .cursor_pointer().hover((s) => s.bg(t.raised))
        .on_click((_e, cx) => this.flip(this.open, g.key, cx))
        .child(div().w(14).flex_none().text_color(t.dim).child(opened ? "▾" : "▸"))
        .child(nameCell(g, t.foreground, dot))
        .children(figures(g).map((f) => cell(f, t.foreground))));
      if (!opened) continue;
      for (const p of g.parts) {
        const share = g.cost ? `${Math.round((p.cost / g.cost) * 100)}%` : tokens(g) ? `${Math.round((tokens(p) / tokens(g)) * 100)}%` : "";
        rows.push(h_flex().h(26).flex_none().items_center().px(10).pl(34).border_b(1).border_color(t.border).bg(t.surface)
          .child(nameCell({ ...p, note: [p.note, share].filter(Boolean).join(" · ") }, t.muted, null))
          .children(figures(p).map((f) => cell(f, t.muted))));
      }
    }

    const groupLabel = GROUPS.find(([key]) => key === this.group)[1].toLowerCase();
    const breakdownLabel = GROUPS.find(([key]) => key === breakdownOf(this.group))[1].toLowerCase();
    const total = sum.total;

    return v_flex().id("usage").size_full().bg(t.background).text_color(t.foreground).text_size(13).p(18).gap(14)
      .child(h_flex().items_center().gap(8)
        .child(div().font_semibold().pr(6).child("Usage"))
        .child(segments("tab", TABS, this.tab, "tab"))
        .when(history && !!this.bucket, (el) => el.child(h_flex().id("bucket-clear").h(24).px(8).gap(6).items_center().rounded(6)
          .bg(t.surface).cursor_pointer().hover((s) => s.bg(t.raised))
          .on_click((_e, cx) => this.set("bucket", "", cx))
          .child(div().font_family(MONO).text_size(12).child(formatBucket(this.bucket, sum.chart.weekly)))
          .child(div().text_color(t.muted).child("×"))))
        .child(div().flex_1())
        .when(history, (el) => el
          .child(div().pr(4).font_family(MONO).text_size(12).text_color(t.muted).child(formatSpan(sum.span)))
          .child(segments("range", RANGES, this.range, "range")))
        .child(h_flex().id("refresh").h(26).px(10).items_center().rounded(6).border(1).border_color(t.border)
          .text_color(loading ? t.dim : t.muted).cursor_pointer().hover((s) => s.bg(t.raised).text_color(t.foreground))
          .on_click((_e, cx) => { if (!loading) (history ? this.refresh(cx) : this.refreshSubs(cx)); })
          .child("Refresh")))
      .when(!history, (el) => el.child(v_flex().flex_1().min_h(0).overflow_y_scrollbar()
        .child(subsView(t, this.subs, this.notes(records)))))
      .when(history, (el) => el.child(h_flex().items_center().gap(6).flex_wrap()
        .child(label("Machines"))
        .children(Object.keys(this.results).sort().map(machineChip))
        .when(!Object.keys(this.results).length, (el) => el.child(div().text_color(t.muted).child("No machines")))))
      .when(history, (el) => el.child(h_flex().items_center().gap(6).flex_wrap()
        .child(label("Providers"))
        .children(sum.providers.map(providerChip))
        .when(!sum.providers.length, (el) => el.child(div().text_color(t.muted).child(loading ? "Loading…" : "No usage in this range")))))
      .when(history, (el) => el.child(v_flex().flex_1().min_h(0).gap(14).overflow_y_scrollbar()
        .child(h_flex().gap(32)
          .child(stat("Billed", formatCost(total.billed), total.credits ? `${formatTokens(total.credits)} Copilot credits` : ""))
          .child(stat("Subscriptions", formatCost(total.subscription), "API value, already paid"))
          .child(stat("Input", formatTokens(total.input)))
          .child(stat("Cached input", formatTokens(total.cacheRead)))
          .child(stat("Cache write", formatTokens(total.cacheWrite)))
          .child(stat("Output", formatTokens(total.output)))
          .child(stat("Messages", formatTokens(total.messages))))
        .child(card().p(14).gap(10)
          .child(h_flex().items_center().gap(8)
            .child(div().text_size(12).text_color(t.muted).child(`${this.metric === "tokens" ? "Tokens" : "Cost"} per ${sum.chart.weekly ? "week" : "day"}, by ${groupLabel}`))
            .child(div().flex_1())
            .child(segments("metric", [["cost", "Cost"], ["tokens", "Tokens"]], this.metric, "metric")))
          .child(usageChart(t, sum.chart, {
            picked: this.bucket, pointed: this.pointed, format, nameOf,
            onPoint: (key, on, cx) => { this.pointed = on ? key : this.pointed === key ? "" : this.pointed; cx.notify(); },
            onPick: (key, cx) => this.set("bucket", this.bucket === key ? "" : key, cx),
          })))
        .child(card()
          .child(h_flex().h(40).px(10).gap(8).items_center().border_b(1).border_color(t.border)
            .child(div().text_size(12).text_color(t.muted).child("Group by"))
            .child(segments("group", GROUPS, this.group, "group"))
            .child(div().flex_1())
            .child(div().text_size(12).text_color(t.dim).child(`Click a row for its ${breakdownLabel}s`)))
          .child(h_flex().h(30).flex_none().items_center().px(10).border_b(1).border_color(t.border)
            .child(div().w(14).flex_none())
            .child(div().flex_1().min_w(0).text_size(12).text_color(t.muted).child(GROUPS.find(([key]) => key === this.group)[1]))
            .children(COLUMNS.map(([, title]) => cell(title, t.muted))))
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

async function collect(name, script) {
  if (!script) return { state: "error", records: [], error: "collect.py not found" };
  try {
    const r = await exec("python3", ["-c", script], { on: name, timeout: TIMEOUT_MS });
    if (r.code === 127) return { state: "error", records: [], error: "no python3" };
    if (r.code !== 0) return { state: "error", records: [], error: (r.stderr || `exit ${r.code}`).trim().split("\n").pop() };
    return { state: "ok", records: toRecords(name, JSON.parse(r.stdout).rows) };
  } catch (error) {
    return { state: "error", records: [], error: String(error.message || error).split("\n")[0] };
  }
}
