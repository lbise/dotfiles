import assert from "node:assert/strict";
import test from "node:test";
import { Check } from "typebox/value";

import { DelegateParameters } from "../parameters.ts";

const task = {
  title: "Inspect code",
  prompt: "Find the relevant implementation.",
  subagent_type: "explore",
};

test("delegate accepts a call without run_in_background", () => {
  assert.equal(Check(DelegateParameters, task), true);
});

test("delegate accepts run_in_background either way and rejects other types", () => {
  assert.equal(Check(DelegateParameters, { ...task, run_in_background: false }), true);
  assert.equal(Check(DelegateParameters, { ...task, run_in_background: true }), true);
  assert.equal(Check(DelegateParameters, { ...task, run_in_background: "yes" }), false);
});
