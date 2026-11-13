import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { afterEach, mock } from "node:test";

import { createPublisher } from "../publish.ts";

afterEach(() => mock.timers.reset());

function setup() {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
  const dir = mkdtempSync(join(tmpdir(), "herdr-chat-publish-"));
  const file = join(dir, "state.json");
  const state = { n: 0 };
  const errors: unknown[] = [];
  let builds = 0;
  const publisher = createPublisher(
    file,
    () => {
      builds++;
      if (state.n < 0) throw new Error("build failed");
      return { updated: 0, n: state.n };
    },
    (err) => errors.push(err),
    150
  );
  return { dir, state, errors, publisher, builds: () => builds, read: () => JSON.parse(readFileSync(file, "utf8")) };
}

test("the first change is written at once, later ones at most once per interval", () => {
  const h = setup();
  h.state.n = 1;
  h.publisher.schedule();
  mock.timers.tick(0);
  assert.deepEqual(h.read(), { updated: 1_000_000, n: 1 });

  // A burst inside the interval is one write, at its end, with the latest state.
  for (let i = 2; i <= 20; i++) {
    h.state.n = i;
    h.publisher.schedule();
  }
  mock.timers.tick(149);
  assert.equal(h.read().n, 1);
  mock.timers.tick(1);
  assert.deepEqual(h.read(), { updated: 1_000_150, n: 20 });
  assert.equal(h.builds(), 2);
});

test("nothing is written while the state is unchanged", () => {
  const h = setup();
  h.publisher.schedule();
  mock.timers.tick(0);
  mock.timers.tick(5000);
  h.publisher.schedule();
  mock.timers.tick(0);
  assert.equal(h.builds(), 2);
  assert.equal(h.read().updated, 1_000_000);
});

test("writes go through a temp file that does not stay", () => {
  const h = setup();
  h.publisher.schedule();
  mock.timers.tick(0);
  assert.deepEqual(readdirSync(h.dir), ["state.json"]);
});

test("a failing build is reported, not thrown, and stop() cancels a pending write", () => {
  const h = setup();
  h.state.n = -1;
  h.publisher.schedule();
  mock.timers.tick(0);
  assert.equal(h.errors.length, 1);
  assert.deepEqual(readdirSync(h.dir), []);

  h.state.n = 1;
  h.publisher.schedule();
  h.publisher.stop();
  mock.timers.tick(1000);
  assert.deepEqual(readdirSync(h.dir), []);
});
