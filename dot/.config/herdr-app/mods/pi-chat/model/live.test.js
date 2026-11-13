import assert from "node:assert/strict";
import { test } from "node:test";
import { call, session, text } from "./fixture.js";
import { isLive, mergeLive } from "./live.js";
import { appendLines, createTranscript } from "./transcript.js";

const T0 = Date.parse("2026-01-01T10:00:00.000Z");
const working = (fields) => ({ v: 1, status: "working", updated: T0 + 9000, turn: null, stream: null, ...fields });
const live = (id, name, label, kind, more = {}) => ({ id, kind, name, label, startedAt: T0 + 2000, ...more });

function start() {
  const s = session(T0);
  const transcript = createTranscript();
  return { s, transcript, feed: () => appendLines(transcript, s.take()) };
}

test("idle: the transcript's turns as they are", () => {
  const { s, transcript, feed } = start();
  s.user("hi");
  s.assistant([text("hello")]);
  feed();
  for (const state of [null, { status: "idle", turn: { startedAt: 1, endedAt: 2, steps: [] }, stream: null }]) {
    const view = mergeLive(transcript, state);
    assert.equal(view.turns, transcript.turns);
    assert.equal(view.live, false);
  }
  assert.equal(isLive({ status: "asking" }), true);
});

test("working: running steps and the reply in progress join the last turn", () => {
  const { s, transcript, feed } = start();
  const user = s.user("check it");
  feed();
  const view = mergeLive(
    transcript,
    working({
      turn: {
        startedAt: T0 + 1000,
        endedAt: null,
        steps: [live("c1", "read", "src/a.c", "look", { endedAt: T0 + 2400, ok: true }), live("c2", "bash", "make test", "run")],
      },
      stream: { text: "The check belongs in", thinking: false },
    })
  );
  assert.equal(view.live, true);
  assert.equal(view.turns.length, 1);
  const [turn] = view.turns;
  assert.equal(turn.key, user);
  assert.equal(turn.user.text, "check it");
  assert.deepEqual(turn.steps, [
    { id: "c1", kind: "look", name: "read", label: "src/a.c", result: "", ok: true, durationMs: 400 },
    { id: "c2", kind: "run", name: "bash", label: "make test", result: "", startedAt: T0 + 2000 },
  ]);
  assert.equal(turn.answer, "The check belongs in");
  assert.deepEqual([turn.live, turn.thinking, turn.done, turn.endedAt, turn.durationMs], [true, false, false, null, 8000]);
  // The transcript itself is untouched.
  assert.deepEqual(transcript.turns[0].steps, []);
});

test("live steps overtaken by the transcript keep their turn and their ids", () => {
  const { s, transcript, feed } = start();
  const user = s.user("check it");
  feed();
  const steps = [live("c1", "read", "src/a.c", "look", { endedAt: T0 + 2400, ok: true }), live("c2", "bash", "make test", "run")];
  const before = mergeLive(transcript, working({ turn: { startedAt: T0 + 1000, steps } }));
  assert.deepEqual(before.turns[0].steps.map((step) => step.id), ["c1", "c2"]);

  // The file now has the message with both calls, and the first result.
  s.assistant([text("Looking."), call("c1", "read", { path: "src/a.c" }), call("c2", "bash", { command: "make test" })], "toolUse");
  s.result("c1", "read", "int afh_min;", { durationMs: 380 });
  feed();
  const after = mergeLive(transcript, working({ turn: { startedAt: T0 + 1000, steps }, stream: { text: "Looking.", thinking: false } }));
  assert.deepEqual(after.turns.map((turn) => turn.key), [user]);
  assert.deepEqual(after.turns[0].steps.map((step) => [step.id, step.ok, step.durationMs, step.result, step.startedAt]), [
    ["c1", true, 380, "int afh_min;", undefined], // the file's version
    ["c2", undefined, undefined, "", T0 + 2000], // in the file, still running: timing from the state
  ]);
  // "Looking." is in the file as narration: the state's copy of it is stale.
  assert.equal(after.turns[0].answer, "");
  assert.equal(after.turns[0].narration[0].text, "Looking.");

  // The state learns of the second result before the file does.
  steps[1] = { ...steps[1], endedAt: T0 + 5000, ok: false };
  const ended = mergeLive(transcript, working({ turn: { startedAt: T0 + 1000, steps } }));
  assert.deepEqual([ended.turns[0].steps[1].ok, ended.turns[0].steps[1].durationMs], [false, 3000]);

  // Finished: the file has everything and the state is idle.
  s.result("c2", "bash", "1 failed", { isError: true });
  s.assistant([text("One test fails.")]);
  feed();
  const done = mergeLive(transcript, { status: "idle", turn: { startedAt: T0 + 1000, endedAt: T0 + 9000, steps }, stream: null });
  assert.equal(done.turns, transcript.turns);
  assert.deepEqual([done.turns[0].key, done.turns[0].answer, done.turns[0].live], [user, "One test fails.", undefined]);
  assert.deepEqual(done.turns[0].steps.map((step) => [step.id, step.ok]), [["c1", true], ["c2", false]]);
});

test("a turn the file does not have yet is shown, and keeps its key when the file gets it", () => {
  const { s, transcript, feed } = start();
  s.user("first");
  s.assistant([text("done")]);
  feed();
  const state = working({ updated: T0 + 61000, turn: { startedAt: T0 + 60000, steps: [live("c9", "ls", ".", "look", { startedAt: T0 + 60500 })] }, stream: { text: "", thinking: true } });
  const ahead = mergeLive(transcript, state);
  assert.equal(ahead.turns.length, 2);
  const key = ahead.turns[1].key;
  assert.deepEqual([ahead.turns[1].user, ahead.turns[1].live, ahead.turns[1].thinking, ahead.turns[1].startedAt, ahead.turns[1].durationMs], [null, true, true, T0 + 60000, 1000]);
  assert.deepEqual(ahead.turns[1].steps.map((step) => step.id), ["c9"]);
  assert.equal(mergeLive(transcript, state).turns[1].key, key); // the same on every poll

  s.user("second", 58500);
  feed();
  const caught = mergeLive(transcript, state);
  assert.deepEqual(caught.turns.map((turn) => turn.key), [ahead.turns[0].key, key]);
  assert.equal(caught.turns[1].user.text, "second");
  assert.deepEqual(caught.turns[1].steps.map((step) => step.id), ["c9"]);

  // A later turn gets a key of its own.
  s.assistant([text("ok")]);
  const third = s.user("third");
  feed();
  assert.deepEqual(transcript.turns.map((turn) => turn.key), [ahead.turns[0].key, key, third]);
});

test("without a session file the live turn is all there is", () => {
  const view = mergeLive(createTranscript(), working({ turn: { startedAt: T0, steps: [] }, stream: { text: "Hello", thinking: false } }));
  assert.equal(view.turns.length, 1);
  assert.deepEqual([view.turns[0].user, view.turns[0].answer, view.turns[0].live], [null, "Hello", true]);
});

test("a finished last turn stays the running one while its own run goes on", () => {
  const { s, transcript, feed } = start();
  const user = s.user("go");
  s.assistant([text("partial")], "error", { errorMessage: "overloaded" });
  feed();
  // Pi retries: same run (it began before the failed reply was written).
  const view = mergeLive(transcript, working({ turn: { startedAt: T0 + 1000, steps: [] }, stream: { text: "Second try", thinking: false } }));
  assert.deepEqual(view.turns.map((turn) => turn.key), [user]);
  assert.deepEqual([view.turns[0].error, view.turns[0].answer, view.turns[0].live], [null, "Second try", true]);
});

test("steps of the run that the file has in an earlier turn are not shown twice", () => {
  const { s, transcript, feed } = start();
  s.user("go");
  s.assistant([call("c1", "bash", { command: "make" })], "toolUse");
  s.result("c1", "bash", "ok");
  s.user("also run the tests"); // steering: a new turn in the file, the same run in Pi
  feed();
  const steps = [live("c1", "bash", "make", "run", { endedAt: T0 + 3000, ok: true }), live("c2", "bash", "make test", "run")];
  const view = mergeLive(transcript, working({ turn: { startedAt: T0 + 1000, steps } }));
  assert.deepEqual(view.turns.map((turn) => turn.steps.map((step) => step.id)), [["c1"], ["c2"]]);
});

test("when nothing runs, a step the file never saw finish was interrupted", () => {
  const { s, transcript, feed } = start();
  s.user("go");
  s.assistant([call("c1", "bash", { command: "make" })], "toolUse");
  feed();
  assert.equal(mergeLive(transcript, working({})).turns[0].steps[0].ok, undefined);
  const view = mergeLive(transcript, { status: "idle" });
  assert.equal(view.turns[0].steps[0].ok, false);
  assert.equal(transcript.turns[0].steps[0].ok, undefined);
});

test("odd live steps are tolerated", () => {
  const view = mergeLive(createTranscript(), working({ turn: { steps: [null, { name: "read" }, { id: "c1", name: "web_fetch", label: "x".repeat(300) }, { id: "c2" }] } }));
  assert.deepEqual(view.turns[0].steps.map((step) => [step.id, step.kind, step.name, step.label.length]), [
    ["c1", "look", "web_fetch", 200],
    ["c2", "other", "", 0],
  ]);
});
