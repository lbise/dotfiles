import assert from "node:assert/strict";
import { test } from "node:test";
import { clip, fileChange, shortPath, stepKind, stepLabel } from "./tools.js";

test("kinds follow the protocol's four", () => {
  for (const name of ["read", "grep", "find", "ls", "web_fetch", "WebSearch"]) assert.equal(stepKind(name), "look", name);
  for (const name of ["bash", "powershell", "codemode"]) assert.equal(stepKind(name), "run", name);
  assert.equal(stepKind("edit"), "edit");
  assert.equal(stepKind("write"), "edit");
  assert.equal(stepKind("delegate"), "other");
  assert.equal(stepKind("Agent"), "other");
  assert.equal(stepKind("toString"), "other");
});

test("a path inside the working directory is shown relative to it", () => {
  assert.equal(shortPath("/work/src/a.c", "/work"), "src/a.c");
  assert.equal(shortPath("/work/src/a.c", "/work/"), "src/a.c");
  assert.equal(shortPath("/workshop/a.c", "/work"), "/workshop/a.c");
  assert.equal(shortPath("/work", "/work"), "/work");
  assert.equal(shortPath("src/a.c", "/work"), "src/a.c");
  assert.equal(shortPath("/work/a.c", null), "/work/a.c");
  assert.equal(stepLabel("read", { path: "/work/src/a.c" }, "/work"), "src/a.c");
  assert.equal(fileChange("write", { path: "/work/a.c", content: "x" }, "/work").path, "a.c");
});

test("label is the path, pattern or command on one line", () => {
  assert.equal(stepLabel("read", { path: "src/a.c", offset: 3 }), "src/a.c");
  assert.equal(stepLabel("grep", { pattern: "afh_min", path: "src" }), "afh_min");
  assert.equal(stepLabel("find", { pattern: "*.c", path: "." }), "*.c");
  assert.equal(stepLabel("bash", { command: "make \\\n  -j8\n\ttest" }), "make \\ -j8 test");
  assert.equal(stepLabel("delegate", { title: "Audit", prompt: "long" }), "Audit");
  assert.equal(stepLabel("Agent", { description: "Audit the driver", prompt: "long" }), "Audit the driver");
  assert.equal(stepLabel("ls", {}), "ls");
  assert.equal(stepLabel("mystery", null), "mystery");
});

test("label is at most 200 characters", () => {
  const label = stepLabel("bash", { command: "x".repeat(5000) });
  assert.equal(label.length, 200);
  assert.ok(label.endsWith("…"));
});

test("clip does not leave half a surrogate pair", () => {
  assert.equal(clip("ab😀cd", 4), "ab…");
  assert.equal(clip("abcd", 4), "abcd");
});

test("write counts its lines as added", () => {
  assert.deepEqual(fileChange("write", { path: "a.c", content: "one\ntwo\n" }), { path: "a.c", added: 2, removed: 0 });
  assert.deepEqual(fileChange("write", { path: "a.c", content: "" }), { path: "a.c", added: 0, removed: 0 });
});

test("edit counts the lines that differ, over all its edits", () => {
  const edits = [
    { oldText: "keep\nold\nkeep too", newText: "keep\nnew 1\nnew 2\nkeep too" },
    { oldText: "gone\n", newText: "" },
  ];
  assert.deepEqual(fileChange("edit", { path: "a.c", edits }), { path: "a.c", added: 2, removed: 2 });
  // The older single-edit form.
  assert.deepEqual(fileChange("edit", { path: "a.c", oldText: "a", newText: "a\nb" }), { path: "a.c", added: 1, removed: 0 });
});

test("other tools change no file", () => {
  assert.equal(fileChange("read", { path: "a.c" }), null);
  assert.equal(fileChange("edit", null), null);
});
