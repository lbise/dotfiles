import assert from "node:assert/strict";
import test from "node:test";

import { summarizeFindResult, summarizeGrepResult } from "../search-summary.ts";

test("grep summary reads RTK's grouped match header and omitted-result marker", () => {
  const summary = summarizeGrepResult({
    text: [
      "23 matches in 7 files:",
      "",
      "src/a.ts:1: match",
      "src/b.ts:2: match",
      "[+21 more]",
    ].join("\n"),
  });

  assert.equal(summary, "↳ 23 matches in 7 files · 21 more results not shown");
});

test("grep summary counts Pi's matching lines but not context", () => {
  const summary = summarizeGrepResult({
    text: [
      "src/a.ts-3- before",
      "src/a.ts:4: match one",
      "src/a.ts-5- after",
      "src/b.ts:8: match two",
      "",
      "[2 matches limit reached. Use limit=4 for more]",
    ].join("\n"),
    details: { matchLimitReached: 2, linesTruncated: true },
  });

  assert.equal(summary, "↳ 2 matches in 2 files · limited to 2 matches · some lines shortened");
});

test("find summary reads RTK's compact-tree headers", () => {
  const summary = summarizeFindResult({
    text: [
      "32F 5D:",
      "",
      "./ first.ts second.ts",
      "test/ third.ts",
    ].join("\n"),
  });

  assert.equal(summary, "↳ 32 files in 5 directories");
  assert.equal(
    summarizeFindResult({ text: "1 file in 1 directory" }),
    "↳ 1 file in 1 directory",
  );
});

test("find summary counts Pi's flat paths and reports limited output", () => {
  const summary = summarizeFindResult({
    text: "a.ts\nb.ts\n\n[RTK find output limited to 2 lines by Pi tool request]",
    details: { lineLimitReached: 2, truncation: { truncated: true } },
  });

  assert.equal(summary, "↳ 2 files · limited to 2 results · output truncated");
});

test("search errors and unknown output remain one truthful status", () => {
  assert.equal(
    summarizeGrepResult({ text: "connection refused\nretry failed", isError: true }),
    "↳ error: connection refused retry failed",
  );
  assert.equal(
    summarizeFindResult({ text: "unexpected finder response" }),
    "↳ search completed, count unavailable",
  );
});
