import { test } from "node:test";
import assert from "node:assert/strict";
import { markSpans, wordDiff, wordMarks } from "./words.js";

const marked = (text, ranges) => ranges.map(([a, b]) => text.slice(a, b));

test("an edited word is marked on both sides", () => {
  const before = "const limit = 10;";
  const after = "const limit = 20;";
  const diff = wordDiff(before, after);
  assert.deepEqual(marked(before, diff.before), ["10"]);
  assert.deepEqual(marked(after, diff.after), ["20"]);
});

test("an inserted argument is marked on the new side only", () => {
  const after = "call(a, b, c)";
  const diff = wordDiff("call(a, c)", after);
  assert.deepEqual(diff.before, []);
  assert.deepEqual(marked(after, diff.after), ["b, "]);
});

test("words changed with only blanks between are one mark", () => {
  const before = "return old value;";
  const after = "return new thing;";
  assert.deepEqual(marked(after, wordDiff(before, after).after), ["new thing"]);
});

test("a rewritten line is not marked", () => {
  assert.equal(wordDiff("int x = compute(a);", "// nothing left here"), null);
  assert.equal(wordDiff("", "x"), null);
});

test("removed runs pair with the added run after them, line by line", () => {
  const rows = [
    { kind: "same", text: "a" },
    { kind: "del", text: "x = 1" },
    { kind: "del", text: "y = 2" },
    { kind: "add", text: "x = 3" },
    { kind: "same", text: "b" },
    { kind: "add", text: "z = 4" },
  ];
  const marks = wordMarks(rows);
  assert.deepEqual(marks, [null, [[4, 5]], null, [[4, 5]], null, null]);
});

test("spans are cut at marks and keep their kind", () => {
  const spans = [{ text: "let ", kind: "keyword" }, { text: "abc", kind: null }];
  assert.deepEqual(markSpans(spans, [[2, 5]]), [
    { text: "le", kind: "keyword", mark: false },
    { text: "t ", kind: "keyword", mark: true },
    { text: "a", kind: null, mark: true },
    { text: "bc", kind: null, mark: false },
  ]);
  assert.deepEqual(markSpans(spans, null).map((span) => span.mark), [false, false]);
});
