import { test } from "node:test";
import assert from "node:assert/strict";
import { commentMessage, parseFiles } from "./files.js";

test("files from name-status, numstat and untracked, renames included", () => {
  const nameStatus = ["M", "src/a.c", "R087", "old/b.c", "new/b.c", "D", "gone.txt", "A", "img.png", ""].join("\0");
  const numstat = ["3\t1\tsrc/a.c", "2\t2\t", "old/b.c", "new/b.c", "0\t5\tgone.txt", "-\t-\timg.png", ""].join("\0");
  const { files, limited } = parseFiles(nameStatus, numstat, "fresh.md\0");
  assert.equal(limited, false);
  assert.deepEqual(files.map((f) => [f.path, f.old, f.status, f.add, f.del, f.binary, f.fresh]), [
    ["fresh.md", "fresh.md", "A", 0, 0, false, true],
    ["gone.txt", "gone.txt", "D", 0, 5, false, false],
    ["img.png", "img.png", "A", 0, 0, true, false],
    ["new/b.c", "old/b.c", "R", 2, 2, false, false],
    ["src/a.c", "src/a.c", "M", 3, 1, false, false],
  ]);
});

test("no changes, no files", () => {
  assert.deepEqual(parseFiles("", "", ""), { files: [], limited: false });
});

test("comments make one message: where, the lines, what to do", () => {
  const text = commentMessage([
    { path: "a.c", side: "new", from: 3, to: 4, excerpt: ["+x", "+y"], text: "rename x " },
    { path: "b.c", side: "old", from: 9, to: 9, excerpt: ["-z"], text: "why removed?" },
  ]);
  assert.equal(
    text,
    "Review comments on the current changes. Address each one:\n\n1. a.c:3-4\n```diff\n+x\n+y\n```\nrename x\n\n2. b.c:9 (removed lines)\n```diff\n-z\n```\nwhy removed?",
  );
});
