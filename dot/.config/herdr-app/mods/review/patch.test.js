import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRows, commentSpan, firstShown, gapsOf, hashText, hunkSpan, linesOf, parsePatch, splitRows, stackItems } from "./patch.js";

const DIFF = [
  "diff --git a/x.c b/x.c",
  "--- a/x.c",
  "+++ b/x.c",
  "@@ -3,3 +3,3 @@ int main(void)",
  " c",
  "-d",
  "+D",
  " e",
  "@@ -10,2 +10,3 @@",
  " j",
  "--- comment",
  "+k1",
  "+k2",
  "\\ No newline at end of file",
  "",
].join("\n");
const FILE = ["a", "b", "c", "D", "e", "f", "g", "h", "i", "j", "k1", "k2", "l"];
const show = (rows) => rows.map((row) => (row.kind === "gap" ? `~${row.count}` : row.kind === "hunk" ? "@" : `${row.kind[0]}${row.old ?? ""}:${row.new ?? ""}`));

test("a diff parses into numbered lines; a removed '-- x' line is a line", () => {
  const patch = parsePatch(DIFF);
  assert.equal(patch.hunks.length, 2);
  assert.equal(patch.hunks[0].func, "int main(void)");
  assert.deepEqual(patch.hunks[1].lines.map((line) => [line.kind, line.text, line.old, line.new]), [
    ["same", "j", 10, 10],
    ["del", "-- comment", 11, null],
    ["add", "k1", null, 11],
    ["add", "k2", null, 12],
  ]);
  assert.equal(parsePatch("diff --git a/b b/b\nBinary files a/b and b/b differ\n").binary, true);
});

test("folds lie between hunks, by new line number, with the old numbers' shift", () => {
  const patch = parsePatch(DIFF);
  assert.deepEqual(gapsOf(patch, 13), [
    { from: 1, to: 3, shift: 0 },
    { from: 6, to: 10, shift: 0 },
    { from: 13, to: 14, shift: -1 },
  ]);
});

test("closed folds are one row each; opened, their lines show from the hunks' side", () => {
  const patch = parsePatch(DIFF);
  assert.deepEqual(show(buildRows(patch, FILE, {})), ["~2", "@", "s3:3", "d4:", "a:4", "s5:5", "~4", "@", "s10:10", "d11:", "a:11", "a:12", "~1"]);
  const rows = buildRows(patch, FILE, { 0: 1, 1: 1, 2: 20 });
  assert.deepEqual(show(rows).slice(0, 3), ["~1", "s2:2", "@"]);
  assert.deepEqual(show(rows).slice(7, 11), ["s6:6", "~2", "s9:9", "@"]);
  assert.deepEqual(show(rows).slice(-1), ["s12:13"]);
  assert.equal(rows[rows.length - 1].text, "l");
  assert.ok(!show(buildRows(patch, FILE, "all")).some((row) => row.startsWith("~")));
  // Without the file, folds cannot open.
  assert.deepEqual(show(buildRows(patch, null, "all")).slice(0, 2), ["~2", "@"]);
});

test("a new file's single hunk has no folds", () => {
  const patch = parsePatch("--- /dev/null\n+++ b/n\n@@ -0,0 +1,2 @@\n+x\n+y\n");
  assert.deepEqual(show(buildRows(patch, ["x", "y"], {})), ["@", "a:1", "a:2"]);
});

test("side by side, a removed run sits beside the added run after it", () => {
  const rows = buildRows(parsePatch(DIFF), null, {});
  const pairs = splitRows(rows).map(({ left, right }) => `${left === null ? "-" : show([rows[left]])}|${right === null ? "-" : show([rows[right]])}`);
  assert.deepEqual(pairs.slice(8, 11), ["d11:|a:11", "-|a:12"]);
});

test("helpers", () => {
  assert.equal(hashText("abc"), hashText("abc"));
  assert.notEqual(hashText("abc"), hashText("abd"));
  assert.deepEqual(linesOf("a\nb\n"), ["a", "b"]);
  assert.deepEqual(linesOf(""), []);
});

test("a comment's rows: new side spans removed lines between, old side only removed ones", () => {
  const rows = buildRows(parsePatch(DIFF), null, {});
  // ~, @, s3:3, d4, a:4, s5:5, ~, @, s10:10, d11, a:11, a:12
  assert.deepEqual(commentSpan(rows, { side: "new", from: 3, to: 4 }), [2, 4]);
  assert.deepEqual(commentSpan(rows, { side: "old", from: 4, to: 4 }), [3, 3]);
  assert.equal(commentSpan(rows, { side: "new", from: 40, to: 41 }), null);
  assert.deepEqual(hunkSpan(rows, 1), [2, 5]);
  assert.deepEqual(hunkSpan(rows, 7), [8, 11]);
});

test("stacked items: extras on top and under their line; the first shown at a scroll", () => {
  const card = { h: 50 };
  const { items, tops, total } = stackItems(3, 20, [{ h: 30 }], new Map([[1, [card]]]));
  assert.deepEqual(items.map((item) => item.line ?? "x"), ["x", 0, 1, "x", 2]);
  assert.deepEqual(tops, [0, 30, 50, 70, 120]);
  assert.equal(total, 140);
  assert.equal(firstShown(tops, 0), 0);
  assert.equal(firstShown(tops, 69), 2);
  assert.equal(firstShown(tops, 70), 3);
  assert.equal(firstShown(tops, 500), 4);
  assert.equal(firstShown([], 10), 0);
});
