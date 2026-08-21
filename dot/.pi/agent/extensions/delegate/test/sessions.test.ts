import assert from "node:assert/strict";
import test from "node:test";

import {
  childSessionLabel,
  childSessions,
  resolveResumeSession,
  siblingPath,
  taskAgentName,
  taskSessionName,
} from "../sessions.ts";

const parent = "/sessions/parent.jsonl";
const children = [
  { path: "/sessions/a.jsonl", parentSessionPath: parent, created: new Date("2026-01-02") },
  { path: "/sessions/b.jsonl", parentSessionPath: parent, created: new Date("2026-01-01") },
  { path: "/sessions/other.jsonl", parentSessionPath: "/sessions/other-parent.jsonl", created: new Date("2026-01-01") },
];

test("childSessions filters and orders child lineage for navigation", () => {
  const siblings = childSessions(parent, children);
  assert.deepEqual(siblings.map((session) => session.path), ["/sessions/b.jsonl", "/sessions/a.jsonl"]);
  assert.equal(siblingPath("/sessions/b.jsonl", siblings, 1), "/sessions/a.jsonl");
  assert.equal(siblingPath("/sessions/b.jsonl", siblings, -1), "/sessions/a.jsonl");
});

test("resolveResumeSession requires an exact task owned by a persisted parent", () => {
  const sessions = [
    { id: "task-123", path: "/sessions/task.jsonl", parentSessionPath: parent, created: new Date("2026-01-01") },
    { id: "task-456", path: "/sessions/other.jsonl", parentSessionPath: "/sessions/other-parent.jsonl", created: new Date("2026-01-01") },
  ];

  assert.equal(resolveResumeSession("task-123", parent, sessions).path, "/sessions/task.jsonl");
  assert.throws(() => resolveResumeSession("task", parent, sessions), /Unknown task_id/);
  assert.throws(() => resolveResumeSession("task-456", parent, sessions), /current parent/);
  assert.throws(() => resolveResumeSession("task-123", undefined, sessions), /persisted parent/);
});

test("task metadata binds a child session to its original agent", () => {
  const entries = [
    { type: "custom", customType: "pi-delegate", data: { agent: "explore" } },
  ];
  const legacyEntries = [
    { type: "custom", customType: "pi-task", data: { agent: "explore" } },
  ];

  assert.equal(taskAgentName(entries), "explore");
  assert.equal(taskAgentName(legacyEntries), "explore");
  assert.equal(taskAgentName([]), undefined);
  assert.equal(taskSessionName("explore", "find auth flow"), "Explore: find auth flow");
  assert.equal(
    childSessionLabel({
      id: "01abcdef-rest",
      path: "/sessions/task.jsonl",
      created: new Date("2026-01-01"),
      name: "Explore: find auth flow",
    }),
    "Explore: find auth flow [01abcdef]",
  );
});
