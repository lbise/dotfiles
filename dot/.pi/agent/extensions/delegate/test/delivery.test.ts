import assert from "node:assert/strict";
import test from "node:test";

import { completionDeliveryOptions } from "../delivery.ts";

test("background completion steers an active parent before its next model call", () => {
  assert.deepEqual(completionDeliveryOptions({ isIdle: () => false }), {
    deliverAs: "steer",
    triggerTurn: true,
  });
});

test("background completion follows up when the parent has already settled", () => {
  assert.deepEqual(completionDeliveryOptions({ isIdle: () => true }), {
    deliverAs: "followUp",
    triggerTurn: true,
  });
});

test("background completion follows up when no parent context is bound", () => {
  assert.deepEqual(completionDeliveryOptions(undefined), {
    deliverAs: "followUp",
    triggerTurn: true,
  });
});
