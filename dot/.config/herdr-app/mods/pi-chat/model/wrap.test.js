import assert from "node:assert/strict";
import { test } from "node:test";
import { wrappedRows } from "./wrap.js";

test("wrapped rows", () => {
  assert.equal(wrappedRows("", 10), 1);
  assert.equal(wrappedRows("    ", 10), 1);
  assert.equal(wrappedRows("short", 10), 1);
  assert.equal(wrappedRows("aaaa bbbb cccc", 10), 2); // "aaaa bbbb" | "cccc"
  assert.equal(wrappedRows("a".repeat(25), 10), 3); // a word longer than a row breaks inside
  assert.equal(wrappedRows("ab " + "c".repeat(12), 10), 3); // "ab" | 10 c | 2 c
  assert.equal(wrappedRows("\tx", 4), 2); // a tab is four spaces
});
