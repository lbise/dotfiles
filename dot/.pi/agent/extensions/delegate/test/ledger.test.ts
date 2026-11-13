import assert from "node:assert/strict";
import test from "node:test";

import { completionText, interruptedRecord, reconcile } from "../ledger.ts";

const started = (runId: string) => ({
  type: "custom", customType: "delegate-task",
  data: { runId, phase: "started", taskId: `t-${runId}`, agent: "explore", title: runId },
});
const ended = (runId: string, status = "completed") => ({
  type: "custom", customType: "delegate-task",
  data: { runId, phase: "ended", taskId: `t-${runId}`, agent: "explore", title: runId, status },
});
const delivered = (runId: string) => ({ type: "custom_message", customType: "delegate-completion", details: { runId } });
const ids = (rows: { runId: string }[]) => rows.map((row) => row.runId);

test("a run that started, ended and was delivered needs nothing", () => {
  assert.deepEqual(reconcile([started("a"), ended("a"), delivered("a")]), { interrupted: [], undelivered: [] });
});

test("a run that never ended is interrupted", () => {
  const result = reconcile([started("a"), started("b"), ended("b"), delivered("b")]);
  assert.deepEqual(ids(result.interrupted), ["a"]);
  assert.deepEqual(result.undelivered, []);
});

test("an ending that was never delivered is redelivered once", () => {
  const result = reconcile([started("a"), ended("a"), ended("a")]);
  assert.deepEqual(ids(result.undelivered), ["a"]);
  assert.deepEqual(result.interrupted, []);
});

test("delivery before the ledger order still counts", () => {
  assert.deepEqual(reconcile([started("a"), delivered("a"), ended("a")]), { interrupted: [], undelivered: [] });
});

test("unrelated and malformed entries are ignored", () => {
  const result = reconcile([
    { type: "message" },
    { type: "custom", customType: "delegate-task", data: { phase: "started" } },
    { type: "custom", customType: "delegate-task", data: { runId: "x", phase: "odd" } },
    { type: "custom", customType: "other", data: { runId: "y", phase: "started" } },
    { type: "custom_message", customType: "delegate-completion" },
  ]);
  assert.deepEqual(result, { interrupted: [], undelivered: [] });
});

test("an interrupted ending tells the model how to resume", () => {
  const row = interruptedRecord(started("a").data as never);
  assert.equal(row.status, "interrupted");
  const text = completionText(row, row.error!);
  assert.match(text, /state="interrupted"/);
  assert.match(text, /task_id "t-a"/);
});
