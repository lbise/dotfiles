import assert from "node:assert/strict";
import test from "node:test";

import { MAX_SESSIONS, sessionItems, treeItems } from "../lists.ts";

test("sessions: the name, else the first message on one line; at most MAX_SESSIONS", () => {
  const infos = Array.from({ length: MAX_SESSIONS + 5 }, (_, i) => ({
    path: `/s/${i}.jsonl`,
    cwd: "/w",
    name: i === 0 ? "Named" : undefined,
    firstMessage: `line one\nline ${"x".repeat(300)}`,
    modified: new Date(1000 - i),
    messageCount: i,
  }));
  const items = sessionItems(infos, "/s/1.jsonl");
  assert.equal(items.length, MAX_SESSIONS);
  assert.deepEqual(items[0], { path: "/s/0.jsonl", title: "Named", cwd: "/w", modified: 1000, messages: 0, current: false });
  assert.equal(items[1].current, true);
  assert.equal(items[1].title.length, 200);
  assert.match(items[1].title, /^line one line x+$/);
});

const at = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();
const node = (entry: any, children: any[] = [], label?: string) => ({ entry: { timestamp: at(0), ...entry }, children, label });
const msg = (id: string, parentId: string | null, message: any) => ({ id, parentId, type: "message", message });

test("tree: what /tree shows, active branch first, parents skip hidden entries", () => {
  // u1 → a1 (tool call only, hidden) → t1 (tool result) → a2 "done"   ← leaf
  //    ↘ model change (hidden) → u2 "other way" → a3 (aborted)
  const a1 = { role: "assistant", content: [{ type: "toolCall", id: "c1", name: "read", arguments: { path: "/w/src/a.c" } }], stopReason: "toolUse" };
  const tree = [
    node(msg("u1", null, { role: "user", content: [{ type: "text", text: "hi\nthere" }] }), [
      node({ id: "m1", parentId: "u1", type: "model_change", modelId: "x" }, [
        node(msg("u2", "m1", { role: "user", content: "other way" }), [
          node(msg("a3", "u2", { role: "assistant", content: [], stopReason: "aborted" })),
        ]),
      ]),
      node(msg("a1", "u1", a1), [
        node(msg("t1", "a1", { role: "toolResult", toolCallId: "c1", toolName: "read" }), [
          node(msg("a2", "t1", { role: "assistant", content: [{ type: "text", text: "done" }], stopReason: "stop" }), [], "good"),
        ]),
      ]),
    ]),
  ];
  const items = treeItems(tree, "a2", "/w");
  assert.deepEqual(
    items.map(({ timestamp, ...item }) => item),
    [
      { id: "u1", parentId: null, role: "user", text: "hi there", active: true, label: null },
      { id: "t1", parentId: "u1", role: "toolResult", text: "read src/a.c", active: true, label: null },
      { id: "a2", parentId: "t1", role: "assistant", text: "done", active: true, label: "good" },
      { id: "u2", parentId: "u1", role: "user", text: "other way", active: false, label: null },
      { id: "a3", parentId: "u2", role: "assistant", text: "(aborted)", active: false, label: null },
    ]
  );
  assert.equal(items[0].timestamp, Date.parse(at(0)));

  // A leaf with tool calls only is shown, so the active position is visible.
  assert.deepEqual(treeItems([node(msg("a1", null, a1))], "a1", "/w").map((i) => i.text), ["(no content)"]);
  assert.deepEqual(
    treeItems([node({ id: "c", parentId: null, type: "compaction", tokensBefore: 113089 }), node({ id: "b", parentId: null, type: "branch_summary", summary: "tried A" })], null, "/w").map((i) => [i.role, i.text, i.active]),
    [["compaction", "113k tokens", false], ["branch_summary", "tried A", false]]
  );
});
