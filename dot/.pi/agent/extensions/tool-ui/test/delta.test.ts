import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { cleanDeltaOutput, runDelta } from "../delta.ts";

test("runDelta pipes the patch through the formatter", async () => {
  const directory = mkdtempSync(join(tmpdir(), "pi-tool-ui-"));
  const formatter = join(directory, "fake-delta");
  writeFileSync(formatter, "#!/bin/sh\ncat\n", "utf8");
  chmodSync(formatter, 0o755);

  try {
    const result = await runDelta("--- a/x\n+++ b/x\n+hello\n", { executable: formatter });
    assert.equal(result.error, undefined);
    assert.equal(result.output, "--- a/x\n+++ b/x\n+hello");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("runDelta removes delta's full-width header separator", async () => {
  const directory = mkdtempSync(join(tmpdir(), "pi-tool-ui-"));
  const formatter = join(directory, "fake-delta");
  writeFileSync(
    formatter,
    "#!/bin/sh\nprintf '\\033[1;34mΔ old.ts ⟶ new.ts\\033[0m\\n\\033[34m────────────────\\033[0m\\n+changed\\n'\n",
    "utf8",
  );
  chmodSync(formatter, 0o755);

  try {
    const result = await runDelta("patch", { executable: formatter });
    assert.match(result.output ?? "", /Δ old\.ts/);
    assert.doesNotMatch(result.output ?? "", /──/);
    assert.match(result.output ?? "", /\+changed/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("cleanDeltaOutput removes all embedded styling from the file title", () => {
  const output = cleanDeltaOutput(
    "\u001b[1;38;2;122;162;247mΔ old.ts ⟶ new.ts\u001b[0m\n+changed",
  );
  const title = output.split("\n")[0] ?? "";

  assert.equal(title, "Δ old.ts ⟶ new.ts");
  assert.doesNotMatch(title, /\u001b\[/);
});

test("cleanDeltaOutput preserves delta's insert and delete backgrounds", () => {
  const output = cleanDeltaOutput(
    "\u001b[38;2;247;118;142m\u001b[48;2;55;34;44m-removed\u001b[0m\n"
    + "\u001b[38;2;158;206;106m\u001b[48;2;32;48;59m+added\u001b[0m",
  );

  assert.match(output, /\u001b\[38;2;247;118;142m/);
  assert.match(output, /\u001b\[48;2;55;34;44m/);
  assert.match(output, /\u001b\[38;2;158;206;106m/);
  assert.match(output, /\u001b\[48;2;32;48;59m/);
});

test("runDelta reports spawn failures instead of throwing", async () => {
  const result = await runDelta("patch", { executable: "/no/such/delta" });
  assert.equal(result.output, undefined);
  assert.match(result.error ?? "", /ENOENT/);
});

test("runDelta honors an already-aborted signal", async () => {
  const controller = new AbortController();
  controller.abort();
  const result = await runDelta("patch", { signal: controller.signal });
  assert.equal(result.output, undefined);
  assert.equal(result.error, "delta rendering was cancelled");
});
