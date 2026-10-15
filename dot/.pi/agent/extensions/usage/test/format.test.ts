import assert from "node:assert/strict";
import test from "node:test";

import { formatBar, formatCount, formatReset, formatWindow, ICONS, renderSegments, windowIcon } from "../format.ts";
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

test("window starts with its icon and includes compact counts and note", () => {
  const out = text(
    formatWindow({ icon: ICONS.month, usedPercent: 53.9, used: 14802, limit: 27500, note: [{ text: "+2 overage" }] })
  );
  assert.equal(out, `${ICONS.month} ████░░░░ 53.9% 14.8k/27.5k +2 overage`);
});

test("counts compact above a thousand", () => {
  assert.equal(formatCount(300), "300");
  assert.equal(formatCount(12.34), "12.3");
  assert.equal(formatCount(27500), "27.5k");
  assert.equal(formatCount(3000), "3k");
});

test("reset shows clock time within a day and date beyond", () => {
  const now = new Date(2026, 8, 25, 12, 0).getTime();
  const r = ICONS.reset;
  assert.equal(formatReset(now + 30 * 60_000, now), `${r} 30m 12:30`);
  assert.equal(formatReset(now + 2.5 * 3_600_000, now), `${r} 2h30m 14:30`);
  assert.equal(formatReset(now + 2 * 3_600_000, now), `${r} 2h 14:00`);
  assert.equal(formatReset(now + 3 * 86_400_000, now), `${r} 3d 28.09`);
  assert.equal(formatReset(now - 1000, now), `${r} now`);
  assert.equal(formatReset(undefined, now), null);
});

test("window icons by length", () => {
  assert.equal(windowIcon(300, 0), ICONS.hours);
  assert.equal(windowIcon(3 * 24 * 60, 0), ICONS.days);
  assert.equal(windowIcon(10080, 0), ICONS.week);
  assert.equal(windowIcon(30 * 24 * 60, 0), ICONS.month);
  assert.equal(windowIcon(undefined, 10080), ICONS.week);
});

test("renderSegments applies theme", () => {
  const theme = { fg: (c: string, t: string) => `<${c}>${t}`, bold: (t: string) => `*${t}*` };
  assert.equal(renderSegments([{ text: "a", tone: "dim" }, { text: "b", bold: true }, { text: "" }], theme), "<dim>a*b*");
});
