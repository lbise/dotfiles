import { test } from "node:test";
import assert from "node:assert/strict";
import { highlightLines, highlightRows, languageOf } from "./highlight.js";

const kinds = (spans) => spans.filter((span) => span.kind && span.text.trim()).map((span) => `${span.kind}:${span.text}`);

test("a file's language, from its name or extension", () => {
  assert.equal(languageOf("src/afh.c"), "c");
  assert.equal(languageOf("include/afh.H"), "c");
  assert.equal(languageOf("mods/pi-chat/steps.js"), "javascript");
  assert.equal(languageOf("/work/Makefile"), "makefile");
  assert.equal(languageOf("CMakeLists.txt"), "cmake");
  assert.equal(languageOf("a/b.yml"), "yaml");
  assert.equal(languageOf("tsconfig.json"), "json");
  assert.equal(languageOf("notes.txt"), null);
  assert.equal(languageOf("LICENSE"), null);
});

test("lines keep their spans, and a comment spanning lines colours each", () => {
  const lines = highlightLines(["/* one", "   two */ int x = 0x1f;"], "c");
  assert.deepEqual(kinds(lines[0]), ["comment:/* one"]);
  assert.deepEqual(kinds(lines[1]), ["comment:   two */", "keyword:int", "operator:=", "number:0x1f", "punctuation:;"]);
  // Every character is kept.
  assert.equal(lines[1].map((span) => span.text).join(""), "   two */ int x = 0x1f;");
});

test("an inner token takes its own kind; one Prism does not name, its parent's", () => {
  const [line] = highlightLines(["#define LIMIT 4"], "c");
  assert.deepEqual(kinds(line), ["keyword:#define", "function:LIMIT", "number:4"]);
});

test("each side of a diff is tokenized whole; unchanged lines take the new side's colours", () => {
  const rows = [
    { kind: "same", text: "const a = `x" },
    { kind: "del", text: "y`;" },
    { kind: "add", text: "z`; // done" },
    { kind: "gap", text: "" },
    { kind: "add", text: "let b = 1;" },
  ];
  const spans = highlightRows(rows, "javascript");
  assert.equal(spans.length, rows.length);
  // The template string opened on the line before goes on: in both sides.
  assert.deepEqual(kinds(spans[1]), ["string:y`", "punctuation:;"]);
  assert.deepEqual(kinds(spans[2]), ["string:z`", "punctuation:;", "comment:// done"]);
  assert.deepEqual(spans[3], []);
  assert.deepEqual(kinds(spans[4]), ["keyword:let", "operator:=", "number:1", "punctuation:;"]);
});

test("no language, no spans", () => {
  assert.equal(highlightRows([{ kind: "add", text: "x" }], null), null);
  assert.equal(highlightRows([{ kind: "add", text: "x" }], "nonsense"), null);
  assert.equal(highlightRows([{ kind: "add", text: "x" }], "txt"), null);
});
