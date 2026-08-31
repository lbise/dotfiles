import type {
  AgentToolResult,
  Theme,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { Static, TSchema } from "typebox";

import {
  COLLAPSED_PREVIEW_LINES,
  EXPANDED_PREVIEW_LINES,
  OutputPreview,
  ToolCallDisplay,
  extractText,
  lifecycleStatus,
  splitOutput,
} from "./render.ts";

type DefinitionRenderContext<TParams extends TSchema, TDetails, TState> = Parameters<
  NonNullable<ToolDefinition<TParams, TDetails, TState>["renderCall"]>
>[2];

export type ToolUiHeader = {
  label: string;
  target?: string;
  metadata?: string;
};

export type ToolUiOutput = {
  collapsedLines?: number;
  expandedLines?: number;
  collapsedFrom?: "start" | "end";
};

export type ToolUiRegistration<TParams extends TSchema, TDetails, TState> = {
  header(
    args: Static<TParams>,
    context: DefinitionRenderContext<TParams, TDetails, TState>,
  ): ToolUiHeader;
  output?: ToolUiOutput;
  onResult?(
    result: AgentToolResult<TDetails>,
    context: DefinitionRenderContext<TParams, TDetails, TState>,
  ): void;
};

const calls = new WeakMap<object, ToolCallDisplay>();

function stateObject(state: unknown): object | undefined {
  return state !== null && typeof state === "object" ? state : undefined;
}

function rememberCall(state: unknown, call: ToolCallDisplay): void {
  const key = stateObject(state);
  if (key) calls.set(key, call);
}

function getCall(state: unknown): ToolCallDisplay | undefined {
  const key = stateObject(state);
  return key ? calls.get(key) : undefined;
}

function resultFooter(details: unknown): string | undefined {
  if (!details || typeof details !== "object") return undefined;
  const value = details as {
    truncation?: { truncated?: boolean };
    fullOutputPath?: string;
  };
  const notes: string[] = [];
  if (value.truncation?.truncated) notes.push("backend output truncated");
  if (value.fullOutputPath) notes.push(`full output: ${value.fullOutputPath}`);
  return notes.length > 0 ? notes.join(" · ") : undefined;
}

function updateCall<TParams extends TSchema, TDetails, TState>(
  call: ToolCallDisplay,
  registration: ToolUiRegistration<TParams, TDetails, TState>,
  args: Static<TParams>,
  theme: Theme,
  context: DefinitionRenderContext<TParams, TDetails, TState>,
): void {
  const header = registration.header(args, context);
  call.update(
    header.label,
    header.target ?? "",
    header.metadata ?? "",
    lifecycleStatus(context),
    theme,
  );
}

/**
 * Add tool-ui rendering to a definition without taking ownership of its execution.
 * The caller remains responsible for registering the returned definition with Pi.
 */
export function decorateToolUi<TParams extends TSchema, TDetails, TState>(
  definition: ToolDefinition<TParams, TDetails, TState>,
  registration: ToolUiRegistration<TParams, TDetails, TState>,
): ToolDefinition<TParams, TDetails, TState> {
  return {
    ...definition,
    renderShell: "default",
    renderCall(args, theme, context) {
      const call = context.lastComponent instanceof ToolCallDisplay
        ? context.lastComponent
        : getCall(context.state) ?? new ToolCallDisplay();
      rememberCall(context.state, call);
      updateCall(call, registration, args, theme, context);
      return call;
    },
    renderResult(result, options, theme, context) {
      registration.onResult?.(result, context);
      const call = getCall(context.state);
      if (call) updateCall(call, registration, context.args, theme, context);

      const output = registration.output;
      const lines = splitOutput(extractText(result)).map((line) =>
        theme.fg(context.isError ? "error" : "toolOutput", line)
      );
      const content = {
        lines,
        expanded: options.expanded,
        collapsedLines: output?.collapsedLines ?? COLLAPSED_PREVIEW_LINES,
        expandedLines: output?.expandedLines ?? EXPANDED_PREVIEW_LINES,
        collapsedFrom: output?.collapsedFrom,
        footer: resultFooter(result.details),
      };
      const preview = context.lastComponent instanceof OutputPreview
        ? context.lastComponent
        : new OutputPreview(content, theme);
      preview.setContent(content, theme);
      return preview;
    },
  };
}
