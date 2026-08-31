import assert from "node:assert/strict";
import test from "node:test";

import type { ExtensionContext, Theme, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { decorateToolUi } from "../consumer.ts";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as Theme;

const schema = Type.Object({ value: Type.String() });
type Details = { routedBy: string };
type State = Record<string, unknown>;

test("decorateToolUi adds rendering without replacing tool execution", async () => {
  const execute: ToolDefinition<typeof schema, Details, State>["execute"] = async (_id, params) => ({
    content: [{ type: "text", text: `result: ${params.value}` }],
    details: { routedBy: "owner" },
  });
  const definition: ToolDefinition<typeof schema, Details, State> = {
    name: "owned-tool",
    label: "Owned tool",
    description: "Test tool",
    parameters: schema,
    execute,
  };
  const decorated = decorateToolUi(definition, {
    header(args) {
      return { label: "owned", target: args.value, metadata: "via owner" };
    },
  });

  assert.equal(decorated.execute, execute);
  assert.equal(decorated.renderShell, "default");

  const result = await decorated.execute(
    "call-1",
    { value: "target" },
    undefined,
    undefined,
    {} as ExtensionContext,
  );
  assert.equal(result.details.routedBy, "owner");

  const state: State = {};
  const baseContext = {
    args: { value: "target" },
    toolCallId: "call-1",
    invalidate() {},
    state,
    cwd: "/tmp",
    executionStarted: true,
    argsComplete: true,
    expanded: false,
    showImages: true,
    isError: false,
  };
  const call = decorated.renderCall?.(
    { value: "target" },
    theme,
    { ...baseContext, lastComponent: undefined, isPartial: true },
  );
  assert.match(call?.render(80).join("\n") ?? "", /│ owned target via owner/);

  const output = decorated.renderResult?.(
    result,
    { expanded: false, isPartial: false },
    theme,
    { ...baseContext, lastComponent: undefined, isPartial: false },
  );
  assert.match(call?.render(80).join("\n") ?? "", /│ owned target via owner/);
  assert.match(output?.render(80).join("\n") ?? "", /result: target/);
});
