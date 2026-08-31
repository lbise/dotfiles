import assert from "node:assert/strict";
import test from "node:test";

import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";

import toolUiExtension from "../index.ts";

test("the extension replaces every built-in tool available on this platform", () => {
  const tools = new Map<string, ToolDefinition>();
  const pi = {
    on() {},
    registerTool(definition: ToolDefinition) {
      tools.set(definition.name, definition);
    },
  } as unknown as ExtensionAPI;

  toolUiExtension(pi);

  const expected = ["edit", "read", "write"];
  assert.deepEqual([...tools.keys()].sort(), expected);

  for (const tool of tools.values()) {
    assert.equal(tool.renderShell, "default");
    assert.equal(typeof tool.execute, "function");
    assert.equal(typeof tool.renderCall, "function");
    assert.equal(typeof tool.renderResult, "function");
    assert.ok(tool.promptSnippet, `${tool.name} should preserve Pi's prompt metadata`);
  }
});
