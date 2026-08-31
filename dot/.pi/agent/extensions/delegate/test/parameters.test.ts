import assert from "node:assert/strict";
import test from "node:test";
import { Check } from "typebox/value";

import { DelegateParameters } from "../parameters.ts";

const task = {
  title: "Inspect code",
  prompt: "Find the relevant implementation.",
  subagent_type: "explore",
};

test("delegate defaults to foreground when mode is omitted", () => {
  assert.equal(Check(DelegateParameters, task), true);
});

test("delegate still accepts explicit foreground and background modes", () => {
  assert.equal(Check(DelegateParameters, { ...task, mode: "foreground" }), true);
  assert.equal(Check(DelegateParameters, { ...task, mode: "background" }), true);
});
