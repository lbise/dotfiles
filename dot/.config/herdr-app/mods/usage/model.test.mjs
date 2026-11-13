// node mods/usage/model.test.mjs
import assert from "node:assert/strict";
import { OTHER, formatBucket, formatCost, formatReset, formatSpan, formatTokens, since, summarize, toRecords } from "./model.js";

const now = new Date(2026, 10, 13, 15); // 13 Nov 2026
assert.equal(since("7d", now), "2026-11-07");
assert.equal(since("30d", now), "2026-10-15");
assert.equal(since("month", now), "2026-11-01");
assert.equal(since("all", now), "");

// [day, provider, model, project, messages, input, output, cacheRead, cacheWrite, reasoning, cost]
const records = [
  ...toRecords("wsl", [
    ["2026-11-12", "anthropic", "opus", "~/a", 2, 10, 20, 100, 5, 1, 1.5],
    ["2026-11-13", "anthropic", "opus", "~/b", 1, 1, 2, 10, 0, 0, 0.5],
    ["2026-11-13", "github-copilot", "gpt", "~/a", 1, 3, 4, 0, 0, 0, 0.25],
    ["2026-10-01", "anthropic", "opus", "~/a", 9, 9, 9, 9, 9, 9, 9],
  ]),
  ...toRecords("board", [["2026-11-13", "anthropic", "opus", "~/a", 1, 1, 1, 1, 1, 1, 1]]),
];
const view = { from: "2026-11-01", off: new Set(), group: "model", metric: "cost", today: "2026-11-13" };

const all = summarize(records, view);
assert.equal(all.total.messages, 5);
assert.equal(all.total.cost, 3.25);
// Subscriptions apart from what is billed; Copilot's billed cost in credits.
assert.equal(all.total.subscription, 3);
assert.equal(all.total.billed, 0.25);
assert.equal(all.total.credits, 25);
assert.deepEqual(all.groups.map((g) => [g.name, g.note, g.input]), [["opus", "anthropic", 12], ["gpt", "github-copilot", 3]]);
// A model opens into its machines.
assert.deepEqual(all.groups[0].parts.map((p) => [p.name, p.cost]), [["wsl", 2], ["board", 1]]);

// The chart: one bar per day from the range's first day to today, stacked by group.
assert.equal(all.chart.weekly, false);
assert.equal(all.chart.bars.length, 13);
assert.deepEqual(all.chart.bars.at(-1).parts, { "anthropic\u0000opus": 1.5, "github-copilot\u0000gpt": 0.25 });
assert.deepEqual(all.chart.series, ["anthropic\u0000opus", "github-copilot\u0000gpt"]);

// A bar picked narrows totals and table, not the chart.
const day = summarize(records, { ...view, bucket: "2026-11-12" });
assert.equal(day.total.cost, 1.5);
assert.equal(day.chart.bars.length, 13);

// By machine, a machine opens into its models; by project, into machines.
const byMachine = summarize(records, { ...view, group: "machine" });
assert.deepEqual(byMachine.groups[0].parts.map((p) => p.name), ["opus", "gpt"]);
assert.deepEqual(summarize(records, { ...view, group: "project" }).groups.map((g) => [g.name, g.cost]), [["~/a", 2.75], ["~/b", 0.5]]);

// Tokens instead of cost.
assert.equal(summarize(records, { ...view, metric: "tokens" }).chart.bars.at(-1).total, 13 + 4 + 7);

// A provider left out drops from the totals but stays listed, with what it would add.
const noCopilot = summarize(records, { ...view, off: new Set(["p:github-copilot"]) });
assert.equal(noCopilot.total.cost, 3);
assert.equal(noCopilot.providers.find((p) => p.name === "github-copilot").cost, 0.25);
assert.equal(noCopilot.machines.find((m) => m.name === "wsl").cost, 2);

const noBoard = summarize(records, { ...view, from: "", off: new Set(["m:board"]) });
assert.equal(noBoard.total.cost, 11.25);
assert.equal(noBoard.machines.find((m) => m.name === "board").cost, 1);
// All time from 1 Oct spans 44 days: still daily.
assert.equal(noBoard.chart.bars[0].key, "2026-10-01");

// More than ~3 months: weekly bars, from Monday.
const long = summarize(toRecords("wsl", [["2026-04-15", "anthropic", "opus", "~/a", 1, 1, 1, 1, 1, 1, 1]]), { ...view, from: "" });
assert.equal(long.chart.weekly, true);
assert.equal(long.chart.bars[0].key, "2026-04-13");
assert.equal(long.chart.bars[0].total, 1);

// Past the top series, the rest stack as Other.
const many = toRecords("wsl", Array.from({ length: 8 }, (_, i) => ["2026-11-13", "anthropic", `m${i}`, "~/a", 1, 1, 1, 1, 1, 1, i + 1]));
const stacked = summarize(many, view);
assert.equal(stacked.chart.series.length, 7);
assert.equal(stacked.chart.series.at(-1), OTHER);
assert.equal(stacked.chart.bars.at(-1).parts[OTHER], 3);

assert.equal(formatTokens(950), "950");
assert.equal(formatTokens(1500), "1.5k");
assert.equal(formatTokens(66686336), "67M");
assert.equal(formatTokens(3.4e9), "3.4B");
assert.equal(formatCost(0.0042), "$0.0042");
assert.equal(formatCost(1476.28), "$1,476");
assert.equal(formatBucket("2026-11-12", false), "Nov 12");
assert.equal(formatBucket("2026-11-09", true), "Week of Nov 9");
assert.deepEqual(all.span, { first: "2026-11-01", last: "2026-11-13" });
assert.equal(noBoard.span.first, "2026-10-01"); // all time: from the first day logged
assert.equal(formatSpan(all.span), "Nov 1 – Nov 13");
assert.equal(formatSpan({ first: "2025-12-30", last: "2026-01-02" }), "Dec 30 2025 – Jan 2 2026");
const at = now.getTime();
assert.equal(formatReset(at + 5 * 60000, at), "in 5m");
assert.equal(formatReset(at + 134 * 60000, at), "in 2h 14m");
assert.equal(formatReset(new Date(2026, 11, 1).getTime(), at), "Dec 1");
console.log("ok");
