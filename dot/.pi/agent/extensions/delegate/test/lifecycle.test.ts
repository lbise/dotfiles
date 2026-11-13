// Background subagent lifecycle against real Pi (see harness.ts). Run with:
//   node --import ./delegate/test/pi-resolve.mjs --test delegate/test/lifecycle.test.ts
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { assertInvariant, call, harness, ledger, say, until } from "./harness.ts";

const bg = (name: string, extra: Record<string, unknown> = {}) =>
  ({ title: name, prompt: `CHILD:${name}`, subagent_type: "general", ...extra });

const completions = (h: Awaited<ReturnType<typeof harness>>) =>
  h.entries().filter((entry) => entry.type === "custom_message" && entry.customType === "delegate-completion");

test("background is the default and returns before the child answers", async () => {
  const h = await harness();
  try {
    h.parent.push(() => call(bg("a")), (seen) => say(seen.includes("not the child result") ? "waiting" : "??"));
    await h.runtime.session.prompt("PARENT");
    assert.equal(h.childStarted("a"), true);
    assert.equal(completions(h).length, 0);
    assert.match(h.parentSaw.at(-1)!, /task id="[^"]+" state="running"/);
  } finally { await h.dispose(); }
});

test("a child that settles while the parent is idle starts one turn with its result", async () => {
  const h = await harness();
  try {
    h.parent.push(() => call(bg("a")), () => say("waiting"), (seen) => say(seen.includes("result of a") ? "relayed" : "missing"));
    await h.runtime.session.prompt("PARENT");
    h.release("a");
    await until(() => h.parent.length === 0, "the parent turn on completion");
    await until(() => !h.runtime.session.isStreaming, "the parent to settle");
    assertInvariant(h.entries());
    assert.equal(completions(h).length, 1);
    assert.match(h.parentSaw.at(-1)!, /state="completed"/);
  } finally { await h.dispose(); }
});

test("a child that settles while the parent is streaming is delivered once, after that run", async () => {
  const h = await harness();
  try {
    h.parent.push(
      () => call(bg("a")),
      async () => {
        h.release("a");
        await until(() => [...ledger(h.entries()).values()].some((run) => run.ended.length > 0), "the child to end");
        return say("done meanwhile");
      },
      (seen) => say(seen.includes("result of a") ? "relayed" : "missing"),
    );
    await h.runtime.session.prompt("PARENT");
    await until(() => h.parent.length === 0 && !h.runtime.session.isStreaming, "the follow-up turn");
    assertInvariant(h.entries());
    assert.equal(completions(h).length, 1);
  } finally { await h.dispose(); }
});

test("several children settling together are each delivered once", async () => {
  const h = await harness();
  try {
    h.parent.push(() => call(bg("a"), bg("b"), bg("c")), () => say("waiting"));
    for (let i = 0; i < 6; i++) h.parent.push(() => say("ok"));
    await h.runtime.session.prompt("PARENT");
    h.release("a"); h.release("b"); h.release("c");
    await until(() => completions(h).length === 3, "three completions");
    await until(() => !h.runtime.session.isStreaming, "the parent to settle");
    assertInvariant(h.entries());
    const seen = h.parentSaw.join("\n");
    for (const name of ["a", "b", "c"]) assert.match(seen, new RegExp(`result of ${name}`));
  } finally { await h.dispose(); }
});

test("/reload mid-run interrupts the child, tells the model once, and the task can be resumed", async () => {
  const h = await harness();
  try {
    h.parent.push(() => call(bg("a")), () => say("waiting"));
    await h.runtime.session.prompt("PARENT");
    await h.runtime.session.reload();
    await h.bind();
    await until(() => completions(h).length === 1, "the interrupted completion");
    assertInvariant(h.entries());
    const [run] = [...ledger(h.entries()).values()];
    assert.equal(run.ended[0].status, "interrupted");
    assert.ok(run.ended[0].sessionPath && existsSync(run.ended[0].sessionPath), "child session saved");
    assert.equal(h.runtime.session.isStreaming, false, "no turn is started on reload");

    // A second reload must not deliver it again.
    await h.runtime.session.reload();
    await h.bind();
    assert.equal(completions(h).length, 1);

    h.parent.push(
      (seen) => call(bg("a2", { task_id: run.ended[0].taskId, title: "a" })),
      () => say("waiting again"),
      (seen) => say(seen.includes("result of a2") ? "relayed" : "missing"),
    );
    await h.runtime.session.prompt("PARENT continue");
    h.release("a2");
    await until(() => completions(h).length === 2 && !h.runtime.session.isStreaming, "the resumed completion");
    assertInvariant(h.entries());
  } finally { await h.dispose(); }
});

test("switching session mid-run interrupts the child; returning delivers it once", async () => {
  const h = await harness();
  try {
    h.parent.push(() => call(bg("a")), () => say("waiting"));
    await h.runtime.session.prompt("PARENT");
    const original = h.runtime.session.sessionFile!;
    await h.runtime.newSession();
    await h.bind();
    assert.equal(completions(h).length, 0, "nothing leaks into the new session");
    h.release("a");
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(completions(h).length, 0);

    await h.runtime.switchSession(original);
    await h.bind();
    await until(() => completions(h).length === 1, "the interrupted completion");
    assertInvariant(h.entries());
    assert.equal([...ledger(h.entries()).values()][0].ended[0].status, "interrupted");
  } finally { await h.dispose(); }
});

test("a run left open by a crash is closed and delivered on the next start", async () => {
  const h = await harness();
  try {
    h.parent.push(() => say("hello"));
    await h.runtime.session.prompt("PARENT");
    // What a SIGKILL leaves behind: a started row and nothing else.
    h.runtime.session.sessionManager.appendCustomEntry("delegate-task", {
      runId: "crashed", phase: "started", taskId: "t1", agent: "general", title: "lost",
    });
    await h.runtime.session.reload();
    await h.bind();
    await until(() => completions(h).length === 1, "the crash completion");
    assertInvariant(h.entries());
  } finally { await h.dispose(); }
});

test("aborting the parent does not stop a background child", async () => {
  const h = await harness();
  try {
    let hold!: () => void;
    h.parent.push(
      () => call(bg("a")),
      () => new Promise((resolve) => { hold = () => resolve(say("never")); }),
      (seen) => say(seen.includes("result of a") ? "relayed" : "missing"),
    );
    const prompt = h.runtime.session.prompt("PARENT");
    await until(() => hold !== undefined, "the parent to block");
    const aborting = h.runtime.session.abort();
    hold(); // the faux parent ignores the signal; let its stream end
    await aborting;
    await prompt.catch(() => {});
    h.release("a");
    await until(() => completions(h).length === 1, "the completion");
    await until(() => !h.runtime.session.isStreaming, "the parent to settle");
    assertInvariant(h.entries());
    assert.equal([...ledger(h.entries()).values()][0].ended[0].status, "completed");
  } finally { await h.dispose(); }
});

test("a failing child is delivered once as failed", async () => {
  const h = await harness();
  try {
    h.parent.push(() => call(bg("a")), () => say("waiting"), (seen) => say(seen.includes('state="failed"') ? "saw failure" : "missing"));
    await h.runtime.session.prompt("PARENT");
    const { fauxAssistantMessage } = await import("@earendil-works/pi-ai");
    h.release("a", fauxAssistantMessage("", { stopReason: "error", errorMessage: "boom" }));
    await until(() => completions(h).length === 1 && !h.runtime.session.isStreaming, "the failure");
    assertInvariant(h.entries());
    assert.equal([...ledger(h.entries()).values()][0].ended[0].status, "failed");
  } finally { await h.dispose(); }
});

test("run_in_background false waits and returns the result as the tool result", async () => {
  const h = await harness();
  try {
    h.parent.push(() => {
      setTimeout(() => h.release("a"), 50);
      return call(bg("a", { run_in_background: false }));
    }, (seen) => say(seen.includes("result of a") ? "got it" : "missing"));
    await h.runtime.session.prompt("PARENT");
    assert.equal(completions(h).length, 0);
    assert.equal(ledger(h.entries()).size, 0);
    assert.match(h.parentSaw.at(-1)!, /state="completed"[^]*result of a/);
  } finally { await h.dispose(); }
});

test("running subagents are published on delegate:tasks until they end", async () => {
  const h = await harness();
  try {
    h.parent.push(() => call(bg("a")), () => say("waiting"), () => say("relayed"));
    await h.runtime.session.prompt("PARENT");
    const live = h.tasks.at(-1) as Array<Record<string, any>>;
    assert.equal(live.length, 1);
    assert.equal(live[0].background, true);
    assert.equal(live[0].status, "running");
    assert.ok(live[0].sessionPath && existsSync(live[0].sessionPath), "the child session file exists while it runs");
    assert.ok(live[0].id, "carries the tool call id");
    h.release("a");
    await until(() => completions(h).length === 1, "the completion");
    assert.deepEqual(h.tasks.at(-1), []);
  } finally { await h.dispose(); }
});
