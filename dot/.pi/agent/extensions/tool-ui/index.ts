import {
  createEditToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  getLanguageFromPath,
  highlightCode,
  keyHint,
  renderDiff,
  SettingsManager,
  type ExtensionAPI,
  type ExtensionContext,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import { Container, type Component } from "@earendil-works/pi-tui";

import { cleanDeltaOutput, runDelta, type DeltaEditDetails } from "./delta.ts";
import {
  AnsiLine,
  COLLAPSED_DIFF_LINES,
  COLLAPSED_PREVIEW_LINES,
  EXPANDED_PREVIEW_LINES,
  OutputPreview,
  ToolCallDisplay,
  extractText,
  lifecycleStatus,
  shortenPath,
  splitOutput,
  type PreviewContent,
  type RenderLifecycle,
} from "./render.ts";

type DisplayState = {
  call?: ToolCallDisplay;
};

type RenderContext = RenderLifecycle & {
  argsComplete: boolean;
  expanded: boolean;
  cwd: string;
  state: unknown;
  lastComponent?: Component;
  invalidate(): void;
};

type TextResult = {
  content?: Array<{ type: string; text?: string }>;
  details?: {
    truncation?: { truncated?: boolean };
    fullOutputPath?: string;
  };
};

function callComponent(context: RenderContext): ToolCallDisplay {
  const state = context.state as DisplayState;
  const call = context.lastComponent instanceof ToolCallDisplay
    ? context.lastComponent
    : state.call ?? new ToolCallDisplay();
  state.call = call;
  return call;
}

function settleCall(context: RenderContext, theme: Theme): void {
  (context.state as DisplayState).call?.updateStatus(lifecycleStatus(context), theme);
}

function emptyResult(context: RenderContext): Container {
  const container = context.lastComponent instanceof Container ? context.lastComponent : new Container();
  container.clear();
  return container;
}

function oneLineResult(context: RenderContext, text: string): AnsiLine {
  const line = context.lastComponent instanceof AnsiLine ? context.lastComponent : new AnsiLine();
  line.setText(text);
  return line;
}

function outputPreview(
  context: RenderContext,
  theme: Theme,
  content: PreviewContent,
): OutputPreview {
  const preview = context.lastComponent instanceof OutputPreview
    ? context.lastComponent
    : new OutputPreview(content, theme);
  preview.setContent(content, theme);
  return preview;
}

function styleLines(lines: string[], theme: Theme, error = false): string[] {
  const color = error ? "error" : "toolOutput";
  return lines.map((line) => theme.fg(color, line));
}

function highlightedLines(text: string, path: unknown, theme: Theme): string[] {
  const lines = splitOutput(text);
  const language = typeof path === "string" ? getLanguageFromPath(path) : undefined;
  if (!language) return styleLines(lines, theme);
  return highlightCode(lines.join("\n"), language);
}

function resultFooter(details: unknown): string | undefined {
  if (!details || typeof details !== "object") return undefined;
  const value = details as TextResult["details"];
  const notes: string[] = [];
  if (value?.truncation?.truncated) notes.push("backend output truncated");
  if (value?.fullOutputPath) notes.push(`full output: ${value.fullOutputPath}`);
  return notes.length > 0 ? notes.join(" · ") : undefined;
}

function lineRange(offset: unknown, limit: unknown): string {
  if (typeof offset !== "number" && typeof limit !== "number") return "";
  const start = typeof offset === "number" ? offset : 1;
  const end = typeof limit === "number" ? start + limit - 1 : undefined;
  return `:${start}${end === undefined ? "" : `-${end}`}`;
}

function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function runtimeSettings(ctx: ExtensionContext): SettingsManager {
  return SettingsManager.create(ctx.cwd, undefined, { projectTrusted: ctx.isProjectTrusted() });
}

function registerRead(pi: ExtensionAPI): void {
  const definition = createReadToolDefinition(process.cwd());
  pi.registerTool({
    ...definition,
    renderShell: "default",
    execute(toolCallId, params, signal, onUpdate, ctx) {
      const settings = runtimeSettings(ctx);
      return createReadToolDefinition(ctx.cwd, {
        autoResizeImages: settings.getImageAutoResize(),
      }).execute(toolCallId, params, signal, onUpdate, ctx);
    },
    renderCall(args, theme, context) {
      const call = callComponent(context);
      const path = `${shortenPath(args.path, context.cwd)}${lineRange(args.offset, args.limit)}`;
      call.update("read", path, "", lifecycleStatus(context), theme);
      return call;
    },
    renderResult(result, options, theme, context) {
      settleCall(context, theme);
      const text = extractText(result);
      const lines = highlightedLines(text, context.args.path, theme);
      const footer = resultFooter(result.details);

      if (!options.expanded && !context.isError) {
        const summary = `↳ loaded ${countLabel(lines.length, "line")}`;
        const notes = [footer, keyHint("app.tools.expand", "to expand")].filter(Boolean).join(" · ");
        return oneLineResult(context, theme.fg("muted", `${summary} · ${notes}`));
      }

      return outputPreview(context, theme, {
        lines: context.isError ? styleLines(splitOutput(text), theme, true) : lines,
        expanded: options.expanded,
        collapsedLines: COLLAPSED_PREVIEW_LINES,
        expandedLines: EXPANDED_PREVIEW_LINES,
        footer,
      });
    },
  });
}

function registerWrite(pi: ExtensionAPI): void {
  const definition = createWriteToolDefinition(process.cwd());
  pi.registerTool({
    ...definition,
    renderShell: "default",
    execute(toolCallId, params, signal, onUpdate, ctx) {
      return createWriteToolDefinition(ctx.cwd).execute(toolCallId, params, signal, onUpdate, ctx);
    },
    renderCall(args, theme, context) {
      const call = callComponent(context);
      const text = typeof args.content === "string" ? args.content : "";
      const rawLines = splitOutput(text);
      const previewSource = rawLines.slice(0, EXPANDED_PREVIEW_LINES);
      const language = getLanguageFromPath(args.path);
      const lines = context.argsComplete && language
        ? highlightCode(previewSource.join("\n"), language)
        : styleLines(previewSource, theme);
      const footer = rawLines.length > previewSource.length
        ? `preview limited to ${countLabel(previewSource.length, "line")}`
        : undefined;
      const body = text
        ? new OutputPreview({
            lines,
            expanded: context.expanded,
            collapsedLines: COLLAPSED_PREVIEW_LINES,
            expandedLines: EXPANDED_PREVIEW_LINES,
            footer,
          }, theme)
        : undefined;
      const bytes = Buffer.byteLength(text, "utf8");
      call.update(
        "write",
        shortenPath(args.path, context.cwd),
        `${countLabel(rawLines.length, "line")} · ${bytes} bytes`,
        lifecycleStatus(context),
        theme,
        body,
      );
      return call;
    },
    renderResult(result, options, theme, context) {
      settleCall(context, theme);
      if (!context.isError) return emptyResult(context);
      return outputPreview(context, theme, {
        lines: styleLines(splitOutput(extractText(result)), theme, true),
        expanded: options.expanded,
        collapsedLines: COLLAPSED_PREVIEW_LINES,
        expandedLines: EXPANDED_PREVIEW_LINES,
      });
    },
  });
}

function registerEdit(pi: ExtensionAPI): void {
  const definition = createEditToolDefinition(process.cwd());
  let warned = false;

  pi.registerTool({
    ...definition,
    renderShell: "default",
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const result = await createEditToolDefinition(ctx.cwd).execute(toolCallId, params, signal, onUpdate, ctx);
      const details = result.details;
      if (!details?.patch || ctx.mode !== "tui") return result;

      const rendered = await runDelta(details.patch, { signal, cwd: ctx.cwd });
      if (rendered.error && !signal?.aborted && !warned) {
        warned = true;
        ctx.ui.notify(`delta diff unavailable: ${rendered.error}. Using Pi's diff renderer.`, "warning");
      }

      return {
        ...result,
        details: {
          ...details,
          ...(rendered.output ? { deltaOutput: rendered.output } : {}),
          ...(rendered.error ? { deltaError: rendered.error } : {}),
        } satisfies DeltaEditDetails,
      };
    },
    renderCall(args, theme, context) {
      const call = callComponent(context);
      const edits = Array.isArray(args.edits) ? args.edits.length : 0;
      call.update(
        "edit",
        shortenPath(args.path, context.cwd),
        countLabel(edits, "block"),
        lifecycleStatus(context),
        theme,
      );
      return call;
    },
    renderResult(result, options, theme, context) {
      settleCall(context, theme);
      if (context.isError) {
        return outputPreview(context, theme, {
          lines: styleLines(splitOutput(extractText(result)), theme, true),
          expanded: options.expanded,
          collapsedLines: COLLAPSED_DIFF_LINES,
          expandedLines: EXPANDED_PREVIEW_LINES,
        });
      }

      const details = result.details as DeltaEditDetails | undefined;
      const output = details?.deltaOutput
        ? cleanDeltaOutput(details.deltaOutput)
        : details?.diff ? renderDiff(details.diff, { filePath: context.args.path }) : "";
      if (!output) return emptyResult(context);
      const lines = splitOutput(output).map((line) =>
        line.startsWith("Δ ") ? theme.fg("accent", line) : line
      );
      return outputPreview(context, theme, {
        lines,
        expanded: options.expanded,
        collapsedLines: COLLAPSED_DIFF_LINES,
        expandedLines: EXPANDED_PREVIEW_LINES,
        footer: details?.deltaError ? "delta unavailable, using Pi's diff renderer" : undefined,
      });
    },
  });
}

/** Replace unclaimed built-in renderers while delegating execution back to Pi. */
export default function toolUiExtension(pi: ExtensionAPI): void {
  // RTK owns bash, grep, find, and ls. Pi cannot compose two tool overrides, so
  // registering those names here would replace RTK's execution routing.
  registerRead(pi);
  registerEdit(pi);
  registerWrite(pi);
}
