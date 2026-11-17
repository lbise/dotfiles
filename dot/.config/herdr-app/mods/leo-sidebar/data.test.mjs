import assert from "node:assert/strict";
import { test } from "node:test";
import { agentName, ago, current, machineLabel, machineState, ordered, span } from "./data.js";

test("machineState: quiet when reachable, loud otherwise", () => {
  const known = [
    { name: "a", state: "connected" },
    { name: "b", state: "unreachable" },
    { name: "c", state: "needs_login" },
    { name: "d", state: "connecting" },
  ];
  const layouts = [{ name: "a", layout: "ready" }, { name: "e", layout: "loading" }, { name: "f", layout: "unavailable" }];
  assert.equal(machineState(null, known, layouts), "ok");
  assert.equal(machineState("a", known, layouts), "ok");
  assert.equal(machineState("b", known, layouts), "down");
  assert.equal(machineState("c", known, layouts), "login");
  assert.equal(machineState("d", known, layouts), "connecting");
  assert.equal(machineState("e", known, layouts), "connecting");
  assert.equal(machineState("f", known, layouts), "down");
  assert.equal(machineState("g", [], []), "ok");
});

test("machineLabel drops the ordering number only", () => {
  assert.equal(machineLabel("2-uboard311"), "uboard311");
  assert.equal(machineLabel("pevb12"), "pevb12");
  assert.equal(machineLabel("uboard-3"), "uboard-3");
});

test("ordered: needs you, done, idle, then working; newest first within", () => {
  const list = [
    { address: "w", status: "working", seq: 1 },
    { address: "i", status: "idle", seq: 2 },
    { address: "b", status: "blocked", seq: 3 },
    { address: "d1", status: "done", seq: 4 },
    { address: "d2", status: "done", seq: 5 },
  ];
  const since = { d1: 200, d2: 100 };
  assert.deepEqual(ordered(list, (a) => since[a.address] ?? 0).map((a) => a.address), ["b", "d1", "d2", "i", "w"]);
});

test("agentName: Pi's title, a named tab, a telling title, else the space", () => {
  const a = { title: "⠋ π - leo_dotfiles", tab_name: "2", space_name: "rom", program: { name: "Pi", key: "pi" }, address: "t1" };
  assert.equal(agentName(a, "AFH check", false), "AFH check");
  assert.equal(agentName({ ...a, tab_name: "review" }, null, true), "review");
  assert.equal(agentName(a, null, false), "rom");
  assert.equal(agentName({ ...a, title: "✦ Fix the login" }, null, false), "Fix the login");
  assert.equal(agentName({ ...a, title: "~/andromeda/rom" }, null, false), "rom");
});

test("current: the step still running", () => {
  assert.equal(current(null), null);
  assert.deepEqual(current({ steps: [{ kind: "look", label: "a.c", endedAt: 1 }, { kind: "run", label: "make" }] }), { verb: "Running", label: "make" });
  assert.equal(current({ steps: [{ kind: "edit", label: "a.c", endedAt: 2 }] }), null);
});

test("span and ago", () => {
  assert.equal(span(45000), "45s");
  assert.equal(span(380000), "6m 20s");
  assert.equal(span(360000), "6m");
  assert.equal(span(3900000), "1h 5m");
  assert.equal(ago(30000), "<1m");
  assert.equal(ago(7200000), "2h");
});
