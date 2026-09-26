import assert from "node:assert/strict";
import test from "node:test";

import { formatBar, formatReset, formatWindow, renderSegments, windowLabel } from "../format.ts";
import type { Segment } from "../types.ts";

const text = (segments: Segment[]) => segments.map((s) => s.text).join("");

test("bar fills proportionally and colors by threshold", () => {
  assert.equal(text(formatBar(50)), "████░░░░ 50%");
  assert.equal(formatBar(50)[0].tone, "success");
  assert.equal(formatBar(75)[0].tone, "warning");
  assert.equal(formatBar(95)[0].tone, "error");
});

test("bar shows at least one block for small usage and clamps above 100", () => {
  assert.equal(text(formatBar(0)), "░░░░░░░░ 0%");
  assert.equal(text(formatBar(1)), "█░░░░░░░ 1%");
  assert.equal(text(formatBar(120)), "████████ 120%");
});

test("window includes counts and note", () => {
  const out = text(
    formatWindow({ label: "month", usedPercent: 10, used: 30, limit: 300, note: [{ text: "+2 overage" }] })
  );
  assert.equal(out, "month █░░░░░░░ 10% (30/300) · +2 overage");
});

test("reset text scales with remaining time", () => {
  const now = new Date(2026, 8, 25, 12, 0).getTime();
  assert.equal(formatReset(now + 30 * 60_000, now), "Reset 30m (25.09)");
  assert.equal(formatReset(now + 2.5 * 3_600_000, now), "Reset 2h 30m (25.09)");
  assert.equal(formatReset(now + 3 * 86_400_000, now), "Reset 3 days (28.09)");
  assert.equal(formatReset(now - 1000, now), "Reset now (25.09)");
  assert.equal(formatReset(undefined, now), null);
});

test("window labels", () => {
  assert.equal(windowLabel(300, "x"), "5h");
  assert.equal(windowLabel(10080, "x"), "week");
  assert.equal(windowLabel(undefined, "x"), "x");
});

test("renderSegments applies theme", () => {
  const theme = { fg: (c: string, t: string) => `<${c}>${t}`, bold: (t: string) => `*${t}*` };
  assert.equal(renderSegments([{ text: "a", tone: "dim" }, { text: "b", bold: true }, { text: "" }], theme), "<dim>a*b*");
});
