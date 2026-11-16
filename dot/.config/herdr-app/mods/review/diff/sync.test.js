// pi-chat carries a copy of this folder's code (scripts/herdr-app-sync-diff).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

for (const file of ["highlight.js", "words.js", "prism.js"]) {
  test(`pi-chat's ${file} is this one: run scripts/herdr-app-sync-diff`, () => {
    const own = readFileSync(new URL(file, import.meta.url), "utf8");
    const copy = readFileSync(new URL(`../../pi-chat/diff/${file}`, import.meta.url), "utf8");
    assert.ok(own === copy);
  });
}
