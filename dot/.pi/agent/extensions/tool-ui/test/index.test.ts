import assert from "node:assert/strict";
import test from "node:test";

import { createReadTool, type ExtensionAPI, type Theme, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import toolUiExtension from "../index.ts";

test("the extension replaces only unclaimed built-in tools", () => {
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

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as Theme;

function readRenderer() {
  let read: ToolDefinition;
  toolUiExtension({
    registerTool(tool: ToolDefinition) {
      if (tool.name === "read") read = tool;
    },
  } as ExtensionAPI);
  return (result: Parameters<NonNullable<ToolDefinition["renderResult"]>>[0], expanded = false, isError = false, isPartial = false) => {
    const component = read.renderResult!(result, { expanded, isPartial }, theme, {
      args: { path: "file.txt" }, toolCallId: "read-1", cwd: "/tmp", state: {},
      executionStarted: true, argsComplete: true, expanded, isPartial, isError,
      showImages: true, invalidate() {},
    });
    assert.equal(component.render(12).length, 1);
    return component.render(100);
  };
}

for (const expanded of [false, true]) {
  test(`read shows only a summary, expanded=${expanded}`, () => {
    const render = readRenderer();
    assert.deepEqual(render({ content: [{ type: "text", text: "secret\n\n\n" }] }, expanded), ["↳ loaded 3 lines"]);
    assert.deepEqual(render({ content: [{ type: "text", text: "" }] }, expanded), ["↳ loaded 0 lines"]);
    assert.deepEqual(render({ content: [{ type: "text", text: "secret" }] }, expanded), ["↳ loaded 1 line"]);
    assert.deepEqual(render({ content: [{ type: "text", text: "not found\nstack trace" }] }, expanded, true), ["↳ error: not found stack trace"]);
    assert.deepEqual(render({ content: [] }, expanded, false, true), ["↳ loading…"]);
    assert.deepEqual(render({ content: [{ type: "image", data: "", mimeType: "image/png" }] }, expanded), ["↳ loaded image"]);
  });
}

test("read counts real Pi results without continuation notices", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tool-ui-read-"));
  try {
    const path = join(directory, "file.txt");
    const builtin = createReadTool(directory);
    const render = readRenderer();
    await writeFile(path, "one\n\nthree\nfour");
    const limited = await builtin.execute("limited", { path, limit: 2 });
    assert.deepEqual(render(limited), ["↳ loaded 2 lines"]);
    const offset = await builtin.execute("offset", { path, offset: 3 });
    assert.deepEqual(render(offset), ["↳ loaded 2 lines"]);
    await writeFile(path, "line\n".repeat(2100));
    const truncated = await builtin.execute("truncated", { path });
    assert.deepEqual(render(truncated, true), ["↳ loaded 2000 lines · truncated"]);
    await writeFile(path, "x".repeat(60_000));
    const oversized = await builtin.execute("oversized", { path });
    assert.deepEqual(render(oversized), ["↳ loaded 0 lines · truncated"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
