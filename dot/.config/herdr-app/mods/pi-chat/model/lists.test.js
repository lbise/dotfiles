import assert from "node:assert/strict";
import { test } from "node:test";
import { matches, parseCommands, parseSessions, parseTree, sessionCommand, slashItems } from "./lists.js";
import { formatAge } from "./format.js";

test("sessions are checked and their titles made one line", () => {
  const text = JSON.stringify({ v: 1, at: 5, items: [
    { path: "/s/a.jsonl", title: "Fix\n the  build", cwd: "/w", modified: 10, messages: 4, current: true },
    { path: "", title: "no path" },
    { path: "/s/b.jsonl", title: null, modified: "x" },
  ] });
  assert.deepEqual(parseSessions(text), [
    { path: "/s/a.jsonl", title: "Fix the build", cwd: "/w", modified: 10, messages: 4, current: true },
    { path: "/s/b.jsonl", title: "", cwd: "", modified: null, messages: null, current: false },
  ]);
  assert.equal(parseSessions("{"), null);
  assert.equal(parseSessions(JSON.stringify({ v: 2, items: [] })), null);
});

test("the tree indents under forks only, and marks where Pi is", () => {
  // a - b - c        (active)
  //       \ d - e
  const item = (id, parentId, active = false) => ({ id, parentId, role: "user", text: id, timestamp: 1, active, label: null });
  const text = JSON.stringify({ v: 1, at: 1, leaf: "x9", items: [item("a", null, true), item("b", "a", true), item("c", "b", true), item("d", "b"), item("e", "d")] });
  const rows = parseTree(text);
  assert.deepEqual(rows.map((row) => [row.id, row.depth]), [["a", 0], ["b", 0], ["c", 1], ["d", 1], ["e", 1]]);
  assert.deepEqual(rows.filter((row) => row.current).map((row) => row.id), ["c"]); // leaf not listed: the last active one
  const leafListed = parseTree(JSON.stringify({ v: 1, leaf: "b", items: [item("a", null, true), item("b", "a", true)] }));
  assert.deepEqual(leafListed.filter((row) => row.current).map((row) => row.id), ["b"]);
  // An unlisted parent reads as a root.
  assert.equal(parseTree(JSON.stringify({ v: 1, items: [item("z", "gone")] }))[0].parentId, null);
});

test("commands keep their kind, unknown kinds are commands", () => {
  const text = JSON.stringify({ v: 1, commands: [{ name: "skill:tdd", description: "Test first", kind: "skill" }, { name: "/review", kind: "odd" }, { description: "nameless" }] });
  assert.deepEqual(parseCommands(text), [
    { name: "skill:tdd", description: "Test first", kind: "skill" },
    { name: "review", description: "", kind: "command" },
  ]);
});

test("the slash menu: session commands first, then by how well the name matches", () => {
  const commands = [
    { name: "skill:tdd", description: "Test-driven development", kind: "skill" },
    { name: "review", description: "Review a new change", kind: "prompt" },
    { name: "skill:triage", description: "Triage issues", kind: "skill" },
  ];
  assert.deepEqual(slashItems("", commands).map((item) => item.name), ["new", "compact", "resume", "tree", "reload", "skill:tdd", "review", "skill:triage"]);
  assert.deepEqual(slashItems("t", commands).map((item) => item.name), ["tree", "skill:tdd", "skill:triage", "compact"]);
  assert.deepEqual(slashItems("new", commands).map((item) => item.name), ["new", "review"]);
  assert.deepEqual(slashItems("zz", commands), []);
});

test("filter words may come in any order", () => {
  assert.ok(matches("build fix", ["Fix the build", "/w"]));
  assert.ok(!matches("test", ["Fix the build"]));
});

test("a reply that is a session command", () => {
  assert.deepEqual(sessionCommand("/new"), { action: "new", instructions: "" });
  assert.deepEqual(sessionCommand(" /compact keep the API notes \n"), { action: "compact", instructions: "keep the API notes" });
  assert.deepEqual(sessionCommand("/tree"), { action: "tree", instructions: "" });
  assert.deepEqual(sessionCommand("/reload"), { action: "reload", instructions: "" });
  assert.equal(sessionCommand("/new thing"), null);
  assert.equal(sessionCommand("/newer"), null);
  assert.equal(sessionCommand("please /new"), null);
});

test("ages", () => {
  const now = 1_000_000_000_000;
  assert.equal(formatAge(now - 20_000, now), "now");
  assert.equal(formatAge(now - 5 * 60_000, now), "5m ago");
  assert.equal(formatAge(now - 3 * 3_600_000, now), "3h ago");
  assert.equal(formatAge(now - 2 * 86_400_000, now), "2d ago");
  assert.equal(formatAge(now - 20 * 86_400_000, now), "2w ago");
  assert.equal(formatAge(now - 400 * 86_400_000, now), "1y ago");
  assert.equal(formatAge(null, now), "");
});
