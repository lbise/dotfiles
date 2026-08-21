import assert from "node:assert/strict";
import test from "node:test";

import { childToolAllowlist, intersectTools } from "../policy.ts";

test("intersectTools preserves the parent capability ceiling", () => {
  assert.deepEqual(intersectTools(["read", "grep", "edit"], ["read", "grep", "find"]), ["read", "grep"]);
  assert.deepEqual(intersectTools(["read", "grep"], undefined), ["read", "grep"]);
});

test("childToolAllowlist excludes active extension tools that the isolated child cannot load", () => {
  assert.deepEqual(childToolAllowlist(["read", "custom_search", "edit"], undefined), ["read", "edit"]);
  assert.deepEqual(childToolAllowlist(["read", "edit"], ["read"]), ["read"]);
});
