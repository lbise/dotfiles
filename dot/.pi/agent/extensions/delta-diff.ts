// Render successful built-in edit tool results with delta.
//
// Pi currently attaches renderers to tool definitions, so this extension wraps the
// built-in edit tool under the same name. Execution, schema, prompt metadata, and
// file-mutation queueing still come from Pi's implementation. Existing tool_call
// and tool_result event handlers continue to run normally.

import {
  createEditToolDefinition,
  type EditToolDetails,
  type EditToolInput,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import {
  Box,
  Container,
  Spacer,
  Text,
  truncateToWidth,
  wrapTextWithAnsi,
  type Component,
} from "@earendil-works/pi-tui";
import { spawn } from "node:child_process";

const DELTA_TIMEOUT_MS = 10_000;
const MAX_DELTA_OUTPUT_BYTES = 2 * 1024 * 1024;

export type DeltaEditDetails = EditToolDetails & {
  deltaOutput?: string;
  deltaError?: string;
};

type DeltaRunResult = {
  output?: string;
  error?: string;
};

type EditRenderState = {
  callComponent?: Box;
  status?: "pending" | "success" | "error";
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Run delta as a non-interactive diff filter. Failures never fail the edit itself. */
export function runDelta(
  patch: string,
  options: { signal?: AbortSignal; cwd?: string; executable?: string } = {},
): Promise<DeltaRunResult> {
  return new Promise((resolve) => {
    const child = spawn(
      options.executable ?? "delta",
      ["--paging=never", "--width=variable", "--keep-plus-minus-markers"],
      {
        cwd: options.cwd,
        env: {
          ...process.env,
          DELTA_PAGER: "cat",
          GIT_PAGER: "cat",
          PAGER: "cat",
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let settled = false;
    let outputTooLarge = false;

    const finish = (result: DeltaRunResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
      resolve(result);
    };

    const abort = (): void => {
      child.kill();
      finish({ error: "delta rendering was cancelled" });
    };

    const timeout = setTimeout(() => {
      child.kill();
      finish({ error: `delta rendering timed out after ${DELTA_TIMEOUT_MS}ms` });
    }, DELTA_TIMEOUT_MS);
    timeout.unref();

    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) {
      abort();
      return;
    }

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= MAX_DELTA_OUTPUT_BYTES) {
        stdout.push(chunk);
      } else if (!outputTooLarge) {
        outputTooLarge = true;
        child.kill();
      }
    });
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.stdin.on("error", () => {
      // A spawn failure or early delta exit may close stdin before end() finishes.
    });
    child.on("error", (error) => finish({ error: errorText(error) }));
    child.on("close", (code, signal) => {
      if (outputTooLarge) {
        finish({ error: `delta output exceeded ${MAX_DELTA_OUTPUT_BYTES} bytes` });
        return;
      }

      const output = Buffer.concat(stdout).toString("utf8").replaceAll("\r\n", "\n").replace(/\n$/, "");
      const diagnostic = Buffer.concat(stderr).toString("utf8").trim();
      if (code === 0 && output) {
        finish({ output });
        return;
      }

      const status = signal ? `signal ${signal}` : `exit ${code ?? "unknown"}`;
      finish({ error: diagnostic || `delta produced no output (${status})` });
    });

    child.stdin.end(patch);
  });
}

/** Display pre-colored terminal lines without rewrapping diff contents. */
export class DeltaOutput implements Component {
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(
    private readonly output: string,
    private readonly expanded = false,
    private readonly paddingX = 1,
  ) {}

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

    const innerWidth = Math.max(0, width - this.paddingX * 2);
    const padding = " ".repeat(this.paddingX);
    const sourceLines = this.output.replaceAll("\r\n", "\n").split("\n");
    this.cachedLines = sourceLines.flatMap((line) => {
      if (innerWidth === 0) return [""];
      const lines = this.expanded
        ? wrapTextWithAnsi(line, innerWidth)
        : [truncateToWidth(line, innerWidth, "…")];
      return lines.map((rendered) => `${padding}${rendered}${padding}`);
    });
    this.cachedWidth = width;
    return this.cachedLines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}

function formatEditHeader(args: Partial<EditToolInput>, theme: any): string {
  const path = typeof args.path === "string" ? args.path : "";
  return `${theme.fg("toolTitle", theme.bold("edit"))}${path ? ` ${theme.fg("toolOutput", path)}` : ""}`;
}

function callBackground(status: EditRenderState["status"], theme: any): (text: string) => string {
  if (status === "success") return (text) => theme.bg("toolSuccessBg", text);
  if (status === "error") return (text) => theme.bg("toolErrorBg", text);
  return (text) => theme.bg("toolPendingBg", text);
}

function renderCallBox(
  args: Partial<EditToolInput>,
  theme: any,
  state: EditRenderState,
  lastComponent?: Component,
): Box {
  const box = lastComponent instanceof Box
    ? lastComponent
    : state.callComponent ?? new Box(1, 1, (text) => text);
  state.callComponent = box;
  state.status ??= "pending";
  box.setBgFn(callBackground(state.status, theme));
  box.clear();
  box.addChild(new Text(formatEditHeader(args, theme), 0, 0));
  return box;
}

function fallbackPatch(patch: string, theme: any): string {
  return patch
    .split("\n")
    .map((line) => {
      if (line.startsWith("+") && !line.startsWith("+++")) return theme.fg("toolDiffAdded", line);
      if (line.startsWith("-") && !line.startsWith("---")) return theme.fg("toolDiffRemoved", line);
      return theme.fg("toolDiffContext", line);
    })
    .join("\n");
}

export default function deltaDiffExtension(pi: ExtensionAPI): void {
  const metadata = createEditToolDefinition(process.cwd());
  let warned = false;

  pi.registerTool({
    ...metadata,
    label: "edit (delta)",

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const edit = createEditToolDefinition(ctx.cwd);
      const result = await edit.execute(toolCallId, params, signal, onUpdate, ctx);
      const details = result.details as EditToolDetails | undefined;
      if (!details?.patch || ctx.mode !== "tui") return result;

      const rendered = await runDelta(details.patch, { signal, cwd: ctx.cwd });
      if (signal?.aborted) throw new Error("Operation aborted");
      if (rendered.error && !warned) {
        warned = true;
        ctx.ui.notify(`delta diff unavailable: ${rendered.error}. Using the built-in patch view.`, "warning");
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
      return renderCallBox(args, theme, context.state as EditRenderState, context.lastComponent);
    },

    renderResult(result, options, theme, context) {
      const state = context.state as EditRenderState;
      state.status = context.isError ? "error" : "success";
      renderCallBox(context.args, theme, state, state.callComponent);

      const container = context.lastComponent instanceof Container ? context.lastComponent : new Container();
      container.clear();
      container.addChild(new Spacer(1));

      if (context.isError) {
        const message = result.content
          .filter((item) => item.type === "text")
          .map((item) => item.text)
          .join("\n");
        container.addChild(new Text(theme.fg("error", message), 1, 0));
        return container;
      }

      const details = result.details as DeltaEditDetails | undefined;
      const output = details?.deltaOutput ?? (details?.patch ? fallbackPatch(details.patch, theme) : "");
      if (output) container.addChild(new DeltaOutput(output, options.expanded));
      return container;
    },
  });
}
