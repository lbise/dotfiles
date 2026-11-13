import assert from "node:assert/strict";
import { test } from "node:test";
import { contextCells, errorText, formatCost, formatDuration, formatTokens, usageCells, usageGroups } from "./format.js";

test("tokens", () => {
  assert.equal(formatTokens(113089), "113k");
  assert.equal(formatTokens(1000000), "1M");
  assert.equal(formatTokens(950), "950");
  assert.equal(formatTokens(1500), "1.5k");
  assert.equal(formatTokens(9960), "10k");
  assert.equal(formatTokens(999700), "1M");
  assert.equal(formatTokens(1250000), "1.3M");
  assert.equal(formatTokens(0), "0");
  assert.equal(formatTokens(null), "");
});

test("durations", () => {
  assert.equal(formatDuration(134000), "2m 14s");
  assert.equal(formatDuration(18900), "18s");
  assert.equal(formatDuration(450), "450ms");
  assert.equal(formatDuration(3900000), "1h 5m");
  assert.equal(formatDuration(null), "");
});

test("cost", () => {
  assert.equal(formatCost(1.42), "$1.42");
  assert.equal(formatCost(0), "$0.00");
  assert.equal(formatCost(0.001), "<$0.01");
  assert.equal(formatCost(null), "");
});

const filled = (cells) => cells.filter((cell) => cell !== null).length;

test("context map is always 40 cells", () => {
  const cells = contextCells({ tokens: 113089, window: 1000000 });
  assert.equal(cells.length, 40);
  assert.equal(filled(cells), 5); // 11.3% of 40 cells
  assert.deepEqual(cells.slice(0, 6), ["used", "used", "used", "used", "used", null]);
  assert.equal(filled(contextCells({ tokens: 0, window: 1000 })), 0);
  assert.equal(filled(contextCells({ tokens: 1, window: 1000000 })), 1); // anything used shows
  assert.equal(filled(contextCells({ tokens: 2000, window: 1000 })), 40); // over the window
  for (const unknown of [null, { tokens: 5, window: null }, { tokens: 5, window: 0 }]) {
    assert.deepEqual(contextCells(unknown), new Array(40).fill(null));
  }
});

test("context map takes categories from a breakdown", () => {
  const cells = contextCells({
    tokens: 500,
    window: 1000,
    parts: [
      { category: "system", tokens: 100 },
      { category: "messages", tokens: 300 },
    ],
  });
  assert.deepEqual(cells.slice(0, 4), ["system", "system", "system", "system"]);
  assert.equal(cells.filter((cell) => cell === "messages").length, 12);
  assert.equal(cells.filter((cell) => cell === "used").length, 4); // the part nobody named
  assert.equal(filled(cells), 20);
});

test("usage text with a percentage", () => {
  const usage = usageCells("5h 38%");
  assert.equal(usage.label, "5h");
  assert.equal(usage.percent, 38);
  assert.equal(usage.cells.length, 10);
  assert.equal(usage.cells.filter(Boolean).length, 4);
  assert.deepEqual(usage.cells.slice(0, 5), [true, true, true, true, false]);
});

test("usage text drawn for a terminal", () => {
  const usage = usageCells("\uf017 wk ████░░░░ 53.9% 14.8k/27.5k");
  assert.deepEqual([usage.label, usage.percent, usage.detail], ["wk", 53.9, "14.8k/27.5k"]);
  assert.equal(usageCells("120%").cells.filter(Boolean).length, 10);
  assert.equal(usageCells("1%").cells.filter(Boolean).length, 1);
  assert.equal(usageCells("0%").cells.filter(Boolean).length, 0);
  assert.equal(usageCells("75% left").label, "left");
});

test("usage text without a percentage", () => {
  const usage = usageCells("4.5cr");
  assert.deepEqual([usage.label, usage.percent], ["4.5cr", null]);
  assert.deepEqual(usage.cells, new Array(10).fill(false));
  assert.equal(usageCells(undefined).label, "");
});

test("usage groups take the extension's figures, else the text's", () => {
  const groups = usageGroups([
    { key: "usage-primary", text: "󰅐 ███ 38%", label: "5h", percent: 38.4, resets: "2h 10m" },
    { key: "usage-primary-reset", text: "󰑐 2h 10m", label: "5h", resets: "2h 10m" },
    { key: "usage-secondary", text: "wk 53.9% 14.8k/27.5k" },
    { key: "usage-secondary-reset", text: "󰑐 3d" },
    { key: "usage-extra", text: "󱐋 ~0.5cr $0.01", label: "Prompt" },
    { key: "usage-tertiary", text: "██ 76.9% 30.8k/40k →47.8k", label: "Cap", percent: 76.9, detail: "30.8k/40k", tone: "warning", note: "→47.8k", noteTone: "error" },
  ]);
  assert.deepEqual(
    groups.map(({ label, percent, value, resets, words }) => ({ label, percent, value, resets, words })),
    [
      { label: "5h", percent: 38.4, value: "", resets: "2h 10m", words: [] },
      { label: "wk", percent: 53.9, value: "", resets: "", words: ["14.8k/27.5k", "3d"] },
      { label: "Prompt", percent: null, value: "~0.5cr $0.01", resets: "", words: [] },
      { label: "Cap", percent: 76.9, value: "", resets: "", words: ["30.8k/40k"] },
    ],
  );
  assert.equal(groups[0].cells.filter(Boolean).length, 4);
  assert.deepEqual([groups[0].tone, groups[3].tone, groups[3].note, groups[3].noteTone], [null, "warning", "→47.8k", "error"]);
  assert.deepEqual(usageGroups([{ key: "usage-primary", text: "unlimited" }]).map((group) => [group.label, group.value]), [["", "unlimited"]]);
  assert.deepEqual(usageGroups(null), []);
});

test("errorText: a provider's JSON error as a sentence", () => {
  const raw = '429 {"type":"error","error":{"type":"rate_limit_error","message":"Try again later."},"request_id":"r1"}';
  assert.equal(errorText(raw), "429 rate_limit_error: Try again later.");
  assert.equal(errorText('{"message":"Bad key"}'), "Bad key");
  assert.equal(errorText("Connection reset"), "Connection reset");
  assert.equal(errorText("400 {not json"), "400 {not json");
  assert.equal(errorText('500 {"error":{"code":"server_error","message":"Boom"}}'), "500 server_error: Boom");
});
