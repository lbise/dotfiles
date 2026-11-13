import assert from "node:assert/strict";
import test from "node:test";

import { stepKind, stepLabel } from "../steps.ts";

test("tools map to the four step kinds", () => {
  for (const name of ["read", "grep", "find", "ls", "web_fetch", "mcp__docs__search", "tool_search"]) assert.equal(stepKind(name), "look", name);
  for (const name of ["bash", "powershell", "codemode"]) assert.equal(stepKind(name), "run", name);
  for (const name of ["edit", "write"]) assert.equal(stepKind(name), "edit", name);
  for (const name of ["delegate", "ask_user", "mcp__jira__create_issue", "toString"]) assert.equal(stepKind(name), "other", name);
});

test("the label is the path, pattern or command on one line", () => {
  const cwd = "/home/u/rom";
  assert.equal(stepLabel({ path: "/home/u/rom/src/a.c", offset: 10 }, cwd), "src/a.c");
  assert.equal(stepLabel({ path: "src/a.c" }, cwd), "src/a.c");
  assert.equal(stepLabel({ path: "/etc/hosts" }, cwd), "/etc/hosts");
  assert.equal(stepLabel({ path: "/home/u/rom" }, cwd), "/home/u/rom");
  assert.equal(stepLabel({ pattern: "TODO", path: "src" }, cwd), "TODO");
  assert.equal(stepLabel({ command: "make \\\n  -j8\n\ttest" }, cwd), "make \\ -j8 test");
  assert.equal(stepLabel({ title: "Audit", prompt: "long instructions" }, cwd), "Audit");
  assert.equal(stepLabel({ count: 3 }, cwd), "");
  assert.equal(stepLabel(undefined, cwd), "");
  assert.equal(stepLabel({ command: "x".repeat(500) }, cwd).length, 200);
});
