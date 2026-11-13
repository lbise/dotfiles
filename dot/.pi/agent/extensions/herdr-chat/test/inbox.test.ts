import assert from "node:assert/strict";
import { mkdtemp, readdir, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { MAX_AGE_MS, takeInbox } from "../inbox.ts";

const inbox = () => mkdtemp(join(tmpdir(), "herdr-chat-inbox-"));

test("commands come out in name order and their files are deleted", async () => {
  const dir = await inbox();
  await writeFile(join(dir, "1794489190300-b.json"), JSON.stringify({ type: "abort" }));
  await writeFile(join(dir, "1794489190100-z.json"), JSON.stringify({ type: "prompt", text: "first" }));
  await writeFile(join(dir, "1794489190200-a.json"), JSON.stringify({ type: "draft", text: "second" }));

  const { commands, errors } = await takeInbox(dir);
  assert.deepEqual(commands.map((c) => c.type), ["prompt", "draft", "abort"]);
  assert.deepEqual(errors, []);
  assert.deepEqual(await readdir(dir), []);
});

test("files older than the limit are deleted without running", async () => {
  const dir = await inbox();
  const now = Date.now();
  const old = join(dir, "1-old.json");
  await writeFile(old, JSON.stringify({ type: "prompt", text: "stale" }));
  await utimes(old, new Date(now - MAX_AGE_MS - 1000), new Date(now - MAX_AGE_MS - 1000));
  await writeFile(join(dir, "2-new.json"), JSON.stringify({ type: "abort" }));

  const { commands } = await takeInbox(dir, now);
  assert.deepEqual(commands, [{ type: "abort" }]);
  assert.deepEqual(await readdir(dir), []);
});

test("a broken file is reported and deleted; temp files are left alone", async () => {
  const dir = await inbox();
  await writeFile(join(dir, "1-bad.json"), "{ nope");
  await writeFile(join(dir, "2-untyped.json"), JSON.stringify({ text: "no type" }));
  await writeFile(join(dir, "3-ok.json.tmp"), JSON.stringify({ type: "abort" }));
  await writeFile(join(dir, ".4-hidden.json"), JSON.stringify({ type: "abort" }));

  const { commands, errors } = await takeInbox(dir);
  assert.deepEqual(commands, []);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /^inbox 1-bad\.json: /);
  assert.match(errors[1], /not a command/);
  assert.deepEqual((await readdir(dir)).sort(), [".4-hidden.json", "3-ok.json.tmp"]);
});
