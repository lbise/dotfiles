import assert from "node:assert/strict";
import test from "node:test";

import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";

import rtkExtension from "../../rtk.ts";
import toolUiExtension from "../index.ts";

test("RTK registers its tools through tool-ui without duplicate ownership", () => {
  const registrations: ToolDefinition[] = [];
  const pi = {
    on() {},
    registerCommand() {},
    registerTool(definition: ToolDefinition) {
      registrations.push(definition);
    },
  } as unknown as ExtensionAPI;

  rtkExtension(pi);
  toolUiExtension(pi);

  const names = registrations.map((definition) => definition.name);
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
  assert.deepEqual(duplicates, []);

  for (const name of ["bash", "grep", "find", "ls"]) {
    const definition = registrations.find((candidate) => candidate.name === name);
    assert.equal(definition?.renderShell, "default", `${name} should use Pi's background shell`);
    assert.equal(typeof definition?.renderCall, "function");
    assert.equal(typeof definition?.renderResult, "function");
    assert.match(definition?.label ?? "", /rtk/);
  }
});
