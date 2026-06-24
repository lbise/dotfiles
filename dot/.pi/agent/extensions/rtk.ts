// RTK integration for Pi.
//
// Goals:
// - Keep Pi's normal tool names/schema so the model keeps using read/grep/find/ls/bash.
// - Route Pi tools with RTK equivalents through the `rtk` CLI when it is safe.
// - Fall back to Pi's built-in implementations on missing RTK, unsupported RTK commands,
//   unsupported argument shapes, or RTK execution failures.
// - Delegate arbitrary bash command rewriting to `rtk rewrite`, with small Pi-specific
//   safety guards for known-bad RTK rewrites.

import {
  createBashToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  isToolCallEventType,
  truncateHead,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { statSync } from "node:fs";
import { stat as fsStat } from "node:fs/promises";
import { basename, extname, resolve as resolvePath } from "node:path";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

const EXTENSION_NAME = "rtk";
const RTK_TIMEOUT_MS = 15_000;
const RTK_REWRITE_TIMEOUT_MS = 2_000;
const RTK_STATUS_TTL_MS = 30_000;
const DEFAULT_GREP_LIMIT = 100;
const RTK_NOTICE_MAX_LENGTH = 140;
const RTK_READ_COMPACT_BYTE_THRESHOLD = DEFAULT_MAX_BYTES;
const RTK_USER_ONLY_CUSTOM_TYPES = new Set(["rtk-stats", "rtk-clear-stats"]);

const readSchema = Type.Object({
  path: Type.String({ description: "Path to the file to read (relative or absolute)" }),
  offset: Type.Optional(Type.Number({ description: "Line number to start reading from (1-indexed)" })),
  limit: Type.Optional(Type.Number({ description: "Maximum number of lines to read" })),
});

const grepSchema = Type.Object({
  pattern: Type.String({ description: "Search pattern (regex or literal string)" }),
  path: Type.Optional(Type.String({ description: "Directory or file to search (default: current directory)" })),
  glob: Type.Optional(Type.String({ description: "Filter files by glob pattern, e.g. '*.ts' or '**/*.spec.ts'" })),
  ignoreCase: Type.Optional(Type.Boolean({ description: "Case-insensitive search (default: false)" })),
  literal: Type.Optional(Type.Boolean({ description: "Treat pattern as literal string instead of regex (default: false)" })),
  context: Type.Optional(Type.Number({ description: "Number of lines to show before and after each match (default: 0)" })),
  limit: Type.Optional(Type.Number({ description: "Maximum number of matches to return (default: 100)" })),
});

const findSchema = Type.Object({
  pattern: Type.String({
    description: "Glob pattern to match files, e.g. '*.ts', '**/*.json', or 'src/**/*.spec.ts'",
  }),
  path: Type.Optional(Type.String({ description: "Directory to search in (default: current directory)" })),
  limit: Type.Optional(Type.Number({ description: "Maximum number of results (default: 1000)" })),
});

const lsSchema = Type.Object({
  path: Type.Optional(Type.String({ description: "Directory to list (default: current directory)" })),
  limit: Type.Optional(Type.Number({ description: "Maximum number of entries to return (default: 500)" })),
});

type RtkStatus = {
  available: boolean;
  version?: string;
  commands: Set<string>;
  checkedAt: number;
  error?: string;
};

type RtkRunResult = {
  stdout: string;
  stderr: string;
  code: number;
  killed: boolean;
  args: string[];
};

type BashRewriteRoute = {
  route: "rtk" | "pi";
  reason: "hit" | "miss" | "unavailable" | "unsupported" | "disabled" | "failed" | "explicit-rtk";
  command: string;
  originalCommand: string;
  detail?: string;
};

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".svg",
  ".ico",
  ".avif",
]);

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}

function trimOneTrailingNewline(text: string): string {
  return text.endsWith("\n") ? text.slice(0, -1) : text;
}

function parseRtkCommands(helpText: string): Set<string> {
  const commands = new Set<string>();
  let inCommands = false;

  for (const line of helpText.split(/\r?\n/)) {
    if (line.trim() === "Commands:") {
      inCommands = true;
      continue;
    }
    if (inCommands && /^\S/.test(line) && line.trim().endsWith(":")) {
      break;
    }
    if (!inCommands) {
      continue;
    }

    const match = line.match(/^\s{2}([a-zA-Z0-9_.-]+)\s{2,}/);
    if (match?.[1]) {
      commands.add(match[1]);
    }
  }

  return commands;
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function formatRtkCommand(args: string[]): string {
  return ["rtk", ...args].map(shellQuote).join(" ");
}

function compactNoticeText(text: string, maxLength = RTK_NOTICE_MAX_LENGTH): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength - 1)}…`;
}

function isProbablyImagePath(path: string): boolean {
  return IMAGE_EXTENSIONS.has(extname(path).toLowerCase());
}

function toolArgText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function renderRtkToolCall(
  theme: any,
  toolName: string,
  plannedTarget: "rtk" | "pi",
  plannedCommandDisplay: string,
  context?: { state?: Record<string, unknown> },
): Text {
  const actualTarget = context?.state?.rtkActualRoute === "rtk" || context?.state?.rtkActualRoute === "pi"
    ? context.state.rtkActualRoute
    : undefined;
  const actualCommand = typeof context?.state?.rtkActualCommand === "string" ? context.state.rtkActualCommand : undefined;
  const target = actualTarget ?? plannedTarget;
  const commandDisplay = actualCommand ?? plannedCommandDisplay;
  const routeLabel = target === "rtk" ? theme.fg("accent", " ↪ RTK") : theme.fg("dim", " ↪ Pi");

  const compactCommand = compactNoticeText(commandDisplay, 130);
  return new Text(
    `${theme.fg("toolTitle", theme.bold(toolName))}${routeLabel}${compactCommand ? ` ${theme.fg("toolOutput", compactCommand)}` : ""}`,
    0,
    0,
  );
}

function normalizePositiveInteger(value: unknown, fallback: number, min = 1, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function buildRtkGrepToolArgs(params: any): string[] {
  const limit = normalizePositiveInteger(params?.limit, DEFAULT_GREP_LIMIT);
  const args = ["grep", "--max", String(limit), toolArgText(params?.pattern, "<pattern>"), toolArgText(params?.path, ".")];
  if (params?.ignoreCase) args.push("--ignore-case");
  if (params?.literal) args.push("--fixed-strings");
  if (params?.context && params.context > 0) args.push("-C", String(Math.floor(params.context)));
  if (params?.glob) args.push("--glob", params.glob);
  return args;
}

function buildRtkLsToolArgs(params: any): string[] {
  return ["ls", toolArgText(params?.path, ".")];
}

function chooseRtkReadLevelFromSize(size: number): "none" | "minimal" {
  return size > RTK_READ_COMPACT_BYTE_THRESHOLD ? "minimal" : "none";
}

function chooseRtkReadLevelSync(cwd: string, filePath: string): "none" | "minimal" {
  try {
    const fileStat = statSync(resolvePath(cwd, filePath));
    return fileStat.isFile() ? chooseRtkReadLevelFromSize(fileStat.size) : "none";
  } catch {
    return "none";
  }
}

function buildRtkReadToolArgs(cwd: string, params: any): string[] {
  const path = toolArgText(params?.path, "<path>");
  const readLevel = chooseRtkReadLevelSync(cwd, path);
  return readLevel === "minimal"
    ? ["read", "--level", "minimal", "--max-lines", String(DEFAULT_MAX_LINES), path]
    : ["read", "--level", "none", path];
}

function buildPiGrepDisplay(params: any): string {
  return `grep /${toolArgText(params?.pattern, "<pattern>")}/ in ${toolArgText(params?.path, ".")}`;
}

function buildPiFindDisplay(params: any): string {
  return `find ${toolArgText(params?.pattern, "<pattern>")} in ${toolArgText(params?.path, ".")}`;
}

function buildPiLsDisplay(params: any): string {
  return `ls ${toolArgText(params?.path, ".")}`;
}

function buildPiReadDisplay(params: any): string {
  const path = toolArgText(params?.path, "<path>");
  const range = params?.offset !== undefined || params?.limit !== undefined
    ? `:${params?.offset ?? 1}${params?.limit !== undefined ? `-${(params?.offset ?? 1) + params.limit - 1}` : ""}`
    : "";
  return `read ${path}${range}`;
}

function buildBashDisplay(params: any, route?: BashRewriteRoute): string {
  const command = route?.command ?? toolArgText(params?.command, "...");
  return `$ ${command}`;
}

function renderRtkBashToolCall(
  theme: any,
  args: any,
  route: BashRewriteRoute | undefined,
  context: { state?: Record<string, unknown>; executionStarted?: boolean; lastComponent?: any },
): Text {
  const state = context.state ?? {};
  if (context.executionStarted && state.startedAt === undefined) {
    state.startedAt = Date.now();
    state.endedAt = undefined;
  }

  const routeLabel = route?.route === "rtk"
    ? theme.fg("accent", " ↪ RTK")
    : theme.fg("dim", " ↪ Pi") + (route?.reason === "miss" ? theme.fg("muted", " (RTK miss)") : "");
  const detail = route?.detail && route.reason !== "miss" ? theme.fg("muted", ` (${route.detail})`) : "";
  const timeoutSuffix = typeof args?.timeout === "number" && args.timeout > 0
    ? theme.fg("muted", ` (timeout ${args.timeout}s)`)
    : "";
  const commandDisplay = compactNoticeText(buildBashDisplay(args, route), 130);
  const text = context.lastComponent instanceof Text ? context.lastComponent : new Text("", 0, 0);
  text.setText(
    `${theme.fg("toolTitle", theme.bold("bash"))}${routeLabel}${detail} ${theme.fg("toolOutput", commandDisplay)}${timeoutSuffix}`,
  );
  return text;
}

async function chooseRtkReadLevel(cwd: string, filePath: string): Promise<"none" | "minimal"> {
  try {
    const absolutePath = resolvePath(cwd, filePath);
    const fileStat = await fsStat(absolutePath);
    return fileStat.isFile() ? chooseRtkReadLevelFromSize(fileStat.size) : "none";
  } catch {
    // If probing fails, prefer exact RTK read and let the actual read command report errors.
    return "none";
  }
}

function limitOutputLines(text: string, limit: number | undefined, label: string): { text: string; limited: boolean } {
  if (limit === undefined || !Number.isFinite(limit) || limit <= 0) {
    return { text, limited: false };
  }

  const normalizedLimit = Math.floor(limit);
  const lines = text.split(/\r?\n/);
  if (lines.length <= normalizedLimit) {
    return { text, limited: false };
  }

  return {
    text: `${lines.slice(0, normalizedLimit).join("\n")}\n\n[RTK ${label} output limited to ${normalizedLimit} lines by Pi tool request]`,
    limited: true,
  };
}

function buildTextResult(
  rawText: string,
  args: string[],
  extraDetails: Record<string, unknown> = {},
  truncateOptions: { maxLines?: number; maxBytes?: number } = {},
) {
  const cleanText = trimOneTrailingNewline(stripAnsi(rawText));
  const truncation = truncateHead(cleanText, {
    maxLines: truncateOptions.maxLines ?? DEFAULT_MAX_LINES,
    maxBytes: truncateOptions.maxBytes ?? DEFAULT_MAX_BYTES,
  });

  let text = truncation.content;
  if (truncation.truncated) {
    text += `\n\n[RTK output truncated by Pi: ${truncation.outputLines} of ${truncation.totalLines} lines, ${truncation.outputBytes} of ${truncation.totalBytes} bytes]`;
  }

  return {
    content: [{ type: "text", text }],
    details: {
      rtk: true,
      rtkRoute: "rtk",
      rtkCommand: formatRtkCommand(args),
      ...(truncation.truncated ? { truncation } : {}),
      ...extraDetails,
    },
  };
}

function isSuccessLike(result: RtkRunResult): boolean {
  if (result.killed) {
    return false;
  }
  if (result.code === 0) {
    return true;
  }
  // RTK grep returns code 1 for no matches but still prints a compact no-match summary.
  return result.stdout.trim().length > 0;
}

function splitShellArgs(input: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  let escaping = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]!;

    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === "\\" && quote !== "'") {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current.length > 0) {
        args.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (escaping) {
    current += "\\";
  }
  if (current.length > 0) {
    args.push(current);
  }

  return args;
}

function firstShellCommandToken(command: string): string | undefined {
  const token = splitShellArgs(command)[0];
  return token ? basename(token) : undefined;
}

function hasShellToken(command: string, token: string): boolean {
  return splitShellArgs(command).includes(token);
}

function rewriteRgFilesCommandToRtkRg(command: string): string | undefined {
  const tokens = splitShellArgs(command);
  if (basename(tokens[0] ?? "") !== "rg") {
    return undefined;
  }

  if (!tokens.includes("--files") && !tokens.includes("--type-list")) {
    return undefined;
  }

  return formatRtkCommand(["rg", ...tokens.slice(1)]);
}

function isKnownBadRewrite(originalCommand: string, rewrittenCommand: string): boolean {
  const originalFirst = firstShellCommandToken(originalCommand);
  const rewrittenTokens = splitShellArgs(rewrittenCommand);

  // RTK 0.42 rewrites `rg --files ...` to `rtk grep --files ...`, but `rtk grep`
  // expects a search pattern. The correct RTK-side spelling is the hidden/native
  // ripgrep proxy: `rtk rg --files ...`.
  if (
    originalFirst === "rg" &&
    rewrittenTokens[0] === "rtk" &&
    rewrittenTokens[1] === "grep" &&
    (hasShellToken(originalCommand, "--files") || hasShellToken(originalCommand, "--type-list"))
  ) {
    return true;
  }

  // RTK 0.42's `find` wrapper accepts common simple predicates but rejects or
  // ignores compound predicates/actions. Do not rewrite native find calls that
  // need real find semantics.
  if (
    originalFirst === "find" &&
    rewrittenTokens[0] === "rtk" &&
    rewrittenTokens[1] === "find" &&
    [
      "-o",
      "-or",
      "-a",
      "-and",
      "!",
      "-not",
      "(",
      ")",
      "\\(",
      "\\)",
      ",",
      "-path",
      "-regex",
      "-exec",
      "-execdir",
      "-ok",
      "-okdir",
      "-delete",
      "-prune",
      "-quit",
      "-printf",
      "-fprintf",
      "-ls",
      "-fls",
    ].some((token) => hasShellToken(originalCommand, token))
  ) {
    return true;
  }

  return false;
}

function canRouteFindPatternToRtkFind(pattern: string): boolean {
  const trimmed = pattern.trim();
  if (!trimmed) {
    return false;
  }

  // `rtk find` is best for basename-style file discovery and produces compact tree
  // output. Path globs are routed through `rtk rg --files -g` instead so we preserve
  // Pi's glob semantics without relying on `rtk find -path` support.
  return !trimmed.includes("/") && !trimmed.includes("\\") && !trimmed.includes("**");
}

function buildRtkFindToolArgs(status: RtkStatus, pattern: string, searchPath = "."): string[] | undefined {
  if (canRouteFindPatternToRtkFind(pattern) && commandSupported(status, "find")) {
    return ["find", searchPath, "-type", "f", "-name", pattern];
  }

  if (commandSupported(status, "rg")) {
    return ["rg", "--files", "--hidden", "-g", pattern, searchPath];
  }

  return undefined;
}

function commandSupported(status: RtkStatus, command: string): boolean {
  return status.available && status.commands.has(command);
}

async function refreshRtkStatus(pi: ExtensionAPI): Promise<RtkStatus> {
  const checkedAt = Date.now();
  try {
    const version = await pi.exec("rtk", ["--version"], { timeout: RTK_REWRITE_TIMEOUT_MS });
    if (version.code !== 0 || version.killed) {
      return {
        available: false,
        commands: new Set(),
        checkedAt,
        error: (version.stderr || version.stdout || `exit ${version.code}`).trim(),
      };
    }

    const help = await pi.exec("rtk", ["--help"], { timeout: RTK_REWRITE_TIMEOUT_MS });
    const commands = help.code === 0 ? parseRtkCommands(help.stdout) : new Set<string>();

    // `rtk rg` is a useful native ripgrep proxy, but it is not listed in `rtk --help`
    // on RTK 0.42. Probe it so Pi find can route complex globs through RTK too.
    try {
      const rgProbe = await pi.exec("rtk", ["rg", "--version"], { timeout: RTK_REWRITE_TIMEOUT_MS });
      if (rgProbe.code === 0 && !rgProbe.killed) {
        commands.add("rg");
      }
    } catch {
      // Optional hidden proxy; ignore when unavailable.
    }

    return {
      available: true,
      version: version.stdout.trim(),
      commands,
      checkedAt,
      error: commands.size === 0 ? "Could not parse `rtk --help` command list" : undefined,
    };
  } catch (error) {
    return {
      available: false,
      commands: new Set(),
      checkedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export default function rtkPiExtension(pi: ExtensionAPI): void {
  let status: RtkStatus = { available: false, commands: new Set(), checkedAt: 0 };
  let warnedMissing = false;
  const bashRewriteRoutes = new Map<string, BashRewriteRoute>();

  const updateRtkAvailabilityWarning = (ctx?: ExtensionContext | ExtensionCommandContext): void => {
    if (!ctx?.hasUI) {
      if (!status.available && !warnedMissing) {
        warnedMissing = true;
        console.warn(`${EXTENSION_NAME}: rtk is unavailable; Pi tools will use built-in implementations.`);
      }
      return;
    }

    if (status.available) {
      ctx.ui.setWidget("rtk-unavailable", undefined);
      return;
    }

    const reason = status.error ? ` Reason: ${status.error}` : "";
    ctx.ui.setWidget("rtk-unavailable", [
      `⚠ RTK unavailable — Pi tools are using built-in implementations.${reason}`,
      "Fix the rtk binary/PATH, then run /reload.",
    ]);

    if (!warnedMissing) {
      warnedMissing = true;
      ctx.ui.notify(`${EXTENSION_NAME}: rtk is unavailable; Pi tools will use built-in implementations.`, "warning");
    }
  };

  const recordRtkHit = (
    _ctx: ExtensionContext | ExtensionCommandContext,
    _label: string,
    _commandDisplay: string,
  ): void => {
    // Tool-call rows now show the RTK/Pi route directly; no footer/status noise needed.
  };

  const ensureStatus = async (ctx?: ExtensionContext | ExtensionCommandContext): Promise<RtkStatus> => {
    const stale = Date.now() - status.checkedAt > RTK_STATUS_TTL_MS;
    if (!status.checkedAt || stale) {
      status = await refreshRtkStatus(pi);
      if (status.available) {
        warnedMissing = false;
      }
      updateRtkAvailabilityWarning(ctx);
    }

    if (!status.available) {
      updateRtkAvailabilityWarning(ctx);
    }

    return status;
  };

  const runRtk = async (
    ctx: ExtensionContext | ExtensionCommandContext,
    args: string[],
    options: { timeout?: number; signal?: AbortSignal } = {},
  ): Promise<RtkRunResult> => {
    const result = await pi.exec("rtk", args, {
      cwd: ctx.cwd,
      signal: options.signal ?? ctx.signal,
      timeout: options.timeout ?? RTK_TIMEOUT_MS,
    });
    return { ...result, args };
  };

  const getBuiltinToolDefinition = (toolName: "read" | "grep" | "find" | "ls", cwd: string) =>
    toolName === "read"
      ? createReadToolDefinition(cwd)
      : toolName === "grep"
        ? createGrepToolDefinition(cwd)
        : toolName === "find"
          ? createFindToolDefinition(cwd)
          : createLsToolDefinition(cwd);

  const withPiRouteDetails = (result: any, piCommand: string) => ({
    ...result,
    details: {
      ...(result.details && typeof result.details === "object" ? result.details : {}),
      rtkRoute: "pi",
      piCommand,
    },
  });

  const rememberActualRouteFromResult = (result: any, context: any): void => {
    const details = result?.details && typeof result.details === "object" ? result.details : undefined;
    const route = details?.rtkRoute === "rtk" || details?.rtkRoute === "pi" ? details.rtkRoute : undefined;
    const command = typeof details?.rtkCommand === "string"
      ? details.rtkCommand
      : typeof details?.piCommand === "string"
        ? details.piCommand
        : undefined;
    if (!route || !command) {
      return;
    }

    if (context.state.rtkActualRoute !== route || context.state.rtkActualCommand !== command) {
      context.state.rtkActualRoute = route;
      context.state.rtkActualCommand = command;
      queueMicrotask(() => context.invalidate());
    }
  };

  const renderBuiltinResult = (
    toolName: "read" | "grep" | "find" | "ls",
    result: any,
    options: any,
    theme: any,
    context: any,
  ) => {
    rememberActualRouteFromResult(result, context);
    const definition = getBuiltinToolDefinition(toolName, context.cwd);
    return definition.renderResult?.(result, options, theme, context) ?? new Text("", 0, 0);
  };

  const executeBuiltin = async (
    toolName: "read" | "grep" | "find" | "ls",
    toolCallId: string,
    params: any,
    signal: AbortSignal | undefined,
    onUpdate: any,
    ctx: ExtensionContext,
    piCommand: string,
  ) => {
    const definition = getBuiltinToolDefinition(toolName, ctx.cwd);
    const result = await definition.execute(toolCallId, params, signal, onUpdate, ctx);
    return withPiRouteDetails(result, piCommand);
  };

  pi.on("session_start", async (_event, ctx) => {
    warnedMissing = false;
    bashRewriteRoutes.clear();
    status = await refreshRtkStatus(pi);
    updateRtkAvailabilityWarning(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (ctx.hasUI) {
      ctx.ui.setWidget("rtk-unavailable", undefined);
    }
  });

  pi.on("context", (event) => {
    // `/rtk stats` output is for the human transcript only. `sendMessage()` custom
    // messages normally become user messages in the next LLM request, so strip
    // these RTK command messages from model context while keeping them displayed.
    const messages = event.messages.filter(
      (message: any) => message.role !== "custom" || !RTK_USER_ONLY_CUSTOM_TYPES.has(message.customType),
    );
    return messages.length === event.messages.length ? undefined : { messages };
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("bash", event)) {
      return {};
    }

    const command = event.input.command;
    if (typeof command !== "string" || !command.trim()) {
      return {};
    }

    const rememberBashRoute = (route: BashRewriteRoute): void => {
      bashRewriteRoutes.set(event.toolCallId, route);
    };

    const trimmed = command.trimStart();
    if (trimmed === "rtk" || trimmed.startsWith("rtk ")) {
      rememberBashRoute({
        route: "rtk",
        reason: "explicit-rtk",
        command,
        originalCommand: command,
        detail: "explicit",
      });
      return {};
    }

    if (process.env.RTK_DISABLED === "1") {
      rememberBashRoute({
        route: "pi",
        reason: "disabled",
        command,
        originalCommand: command,
        detail: "RTK disabled",
      });
      return {};
    }

    const currentStatus = await ensureStatus(ctx);
    if (!currentStatus.available) {
      rememberBashRoute({
        route: "pi",
        reason: "unavailable",
        command,
        originalCommand: command,
        detail: "RTK unavailable",
      });
      return {};
    }

    if (!commandSupported(currentStatus, "rewrite")) {
      rememberBashRoute({
        route: "pi",
        reason: "unsupported",
        command,
        originalCommand: command,
        detail: "rewrite unsupported",
      });
      return {};
    }

    try {
      const rewritten = await runRtk(ctx, ["rewrite", command], {
        timeout: RTK_REWRITE_TIMEOUT_MS,
        signal: ctx.signal,
      });
      if ((rewritten.code === 0 || rewritten.code === 3) && rewritten.stdout.trim()) {
        const nextCommand = rewritten.stdout.trim();
        if (nextCommand !== command && isKnownBadRewrite(command, nextCommand)) {
          const rtkRgCommand = commandSupported(currentStatus, "rg") ? rewriteRgFilesCommandToRtkRg(command) : undefined;
          if (rtkRgCommand) {
            event.input.command = rtkRgCommand;
            rememberBashRoute({ route: "rtk", reason: "hit", command: rtkRgCommand, originalCommand: command });
            recordRtkHit(ctx, "bash rg", rtkRgCommand);
          } else {
            rememberBashRoute({
              route: "pi",
              reason: "failed",
              command,
              originalCommand: command,
              detail: "unsafe rewrite skipped",
            });
          }
        } else if (nextCommand !== command) {
          event.input.command = nextCommand;
          rememberBashRoute({ route: "rtk", reason: "hit", command: nextCommand, originalCommand: command });
          recordRtkHit(ctx, "bash", nextCommand);
        } else {
          rememberBashRoute({ route: "pi", reason: "miss", command, originalCommand: command });
        }
      } else {
        rememberBashRoute({ route: "pi", reason: "miss", command, originalCommand: command });
      }
    } catch {
      rememberBashRoute({
        route: "pi",
        reason: "failed",
        command,
        originalCommand: command,
        detail: "rewrite failed",
      });
      // Fail open. Bash tool execution must never depend on RTK being healthy.
    }

    return {};
  });

  const bashToolMetadata = createBashToolDefinition(process.cwd());
  pi.registerTool({
    ...bashToolMetadata,
    label: "bash (rtk)",
    description:
      `${bashToolMetadata.description} Eligible commands are preflighted through \`rtk rewrite\`; the tool row shows whether RTK rewrote the command or missed and fell back to plain bash.`,
    promptGuidelines: [
      "Use bash normally; this Pi extension preflights eligible bash commands through RTK and shows RTK/Pi routing in the bash tool row.",
    ],
    renderCall(args, theme, context) {
      return renderRtkBashToolCall(theme, args, bashRewriteRoutes.get(context.toolCallId), context);
    },
    renderResult(result, options, theme, context) {
      const definition = createBashToolDefinition(context.cwd);
      return definition.renderResult?.(result, options, theme, context) ?? new Text("", 0, 0);
    },
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const definition = createBashToolDefinition(ctx.cwd);
      return definition.execute(toolCallId, params, signal, onUpdate, ctx);
    },
  });

  pi.registerTool({
    name: "grep",
    label: "grep (rtk)",
    description:
      "Search file contents for a pattern. Routed through `rtk grep` for token-optimized grouped output when RTK is available; falls back to Pi's built-in ripgrep tool otherwise.",
    promptSnippet: "Search file contents for patterns using RTK-optimized output",
    promptGuidelines: ["Use grep normally; this Pi extension automatically routes grep through RTK when available."],
    parameters: grepSchema,
    renderCall(args, theme, context) {
      const rtkArgs = buildRtkGrepToolArgs(args);
      const target = commandSupported(status, "grep") ? "rtk" : "pi";
      return renderRtkToolCall(
        theme,
        "grep",
        target,
        target === "rtk" ? formatRtkCommand(rtkArgs) : buildPiGrepDisplay(args),
        context,
      );
    },
    renderResult(result, options, theme, context) {
      return renderBuiltinResult("grep", result, options, theme, context);
    },
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const currentStatus = await ensureStatus(ctx);
      if (!commandSupported(currentStatus, "grep")) {
        return executeBuiltin("grep", toolCallId, params, signal, onUpdate, ctx, buildPiGrepDisplay(params));
      }

      const args = buildRtkGrepToolArgs(params);

      try {
        const result = await runRtk(ctx, args, { signal });
        if (isSuccessLike(result)) {
          recordRtkHit(ctx, "grep", formatRtkCommand(args));
          return buildTextResult(result.stdout || result.stderr, args, { exitCode: result.code });
        }
      } catch {
        // Fall through to built-in grep.
      }

      return executeBuiltin("grep", toolCallId, params, signal, onUpdate, ctx, buildPiGrepDisplay(params));
    },
  });

  pi.registerTool({
    name: "find",
    label: "find (rtk)",
    description:
      "Search for files by glob pattern. Simple basename globs are routed through `rtk find` for compact tree output; complex path globs route through `rtk rg --files` when available.",
    promptSnippet: "Find files by glob pattern using RTK-optimized output when possible",
    promptGuidelines: ["Use find normally; this Pi extension routes find queries through RTK when available."],
    parameters: findSchema,
    renderCall(args, theme, context) {
      const pattern = toolArgText(args?.pattern, "<pattern>");
      const path = toolArgText(args?.path, ".");
      const rtkArgs = buildRtkFindToolArgs(status, pattern, path);
      const target = rtkArgs ? "rtk" : "pi";
      return renderRtkToolCall(
        theme,
        "find",
        target,
        rtkArgs ? formatRtkCommand(rtkArgs) : buildPiFindDisplay(args),
        context,
      );
    },
    renderResult(result, options, theme, context) {
      return renderBuiltinResult("find", result, options, theme, context);
    },
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const currentStatus = await ensureStatus(ctx);
      const args = buildRtkFindToolArgs(currentStatus, params.pattern, params.path || ".");
      if (!args) {
        return executeBuiltin("find", toolCallId, params, signal, onUpdate, ctx, buildPiFindDisplay(params));
      }

      try {
        const result = await runRtk(ctx, args, { signal });
        if (isSuccessLike(result)) {
          recordRtkHit(ctx, args[0] === "rg" ? "find rg" : "find", formatRtkCommand(args));
          const limited = limitOutputLines(result.stdout || result.stderr, params.limit, "find");
          return buildTextResult(limited.text, args, {
            exitCode: result.code,
            ...(limited.limited ? { lineLimitReached: params.limit } : {}),
          });
        }
      } catch {
        // Fall through to built-in find.
      }

      return executeBuiltin("find", toolCallId, params, signal, onUpdate, ctx, buildPiFindDisplay(params));
    },
  });

  pi.registerTool({
    name: "ls",
    label: "ls (rtk)",
    description:
      "List directory contents. Routed through `rtk ls` for token-optimized output when RTK is available; falls back to Pi's built-in ls tool otherwise.",
    promptSnippet: "List directory contents using RTK-optimized output",
    promptGuidelines: ["Use ls normally; this Pi extension automatically routes ls through RTK when available."],
    parameters: lsSchema,
    renderCall(args, theme, context) {
      const rtkArgs = buildRtkLsToolArgs(args);
      const target = commandSupported(status, "ls") ? "rtk" : "pi";
      return renderRtkToolCall(
        theme,
        "ls",
        target,
        target === "rtk" ? formatRtkCommand(rtkArgs) : buildPiLsDisplay(args),
        context,
      );
    },
    renderResult(result, options, theme, context) {
      return renderBuiltinResult("ls", result, options, theme, context);
    },
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const currentStatus = await ensureStatus(ctx);
      if (!commandSupported(currentStatus, "ls")) {
        return executeBuiltin("ls", toolCallId, params, signal, onUpdate, ctx, buildPiLsDisplay(params));
      }

      const args = buildRtkLsToolArgs(params);
      try {
        const result = await runRtk(ctx, args, { signal });
        if (isSuccessLike(result)) {
          recordRtkHit(ctx, "ls", formatRtkCommand(args));
          const limited = limitOutputLines(result.stdout || result.stderr, params.limit, "ls");
          return buildTextResult(limited.text, args, {
            exitCode: result.code,
            ...(limited.limited ? { entryLimitReached: params.limit } : {}),
          });
        }
      } catch {
        // Fall through to built-in ls.
      }

      return executeBuiltin("ls", toolCallId, params, signal, onUpdate, ctx, buildPiLsDisplay(params));
    },
  });

  pi.registerTool({
    name: "read",
    label: "read (rtk)",
    description:
      "Read file contents. Whole-file text reads are routed through `rtk read` when RTK is available; large whole-file reads use RTK minimal filtering. Ranged reads and images fall back to Pi's exact built-in read tool.",
    promptSnippet: "Read file contents using RTK for whole-file text reads when safe",
    promptGuidelines: [
      "Use read with offset/limit when exact edit anchors are needed; this RTK extension preserves Pi's built-in exact ranged reads.",
      "Whole-file read output may be compacted by RTK for large files; re-read a focused range before editing exact text.",
    ],
    parameters: readSchema,
    renderCall(args, theme, context) {
      const path = toolArgText(args?.path, "<path>");
      const needsExactPiRead = args?.offset !== undefined || args?.limit !== undefined || isProbablyImagePath(path);
      const target = needsExactPiRead ? "pi" : commandSupported(status, "read") ? "rtk" : "pi";
      return renderRtkToolCall(
        theme,
        "read",
        target,
        target === "rtk" ? formatRtkCommand(buildRtkReadToolArgs(context.cwd, args)) : buildPiReadDisplay(args),
        context,
      );
    },
    renderResult(result, options, theme, context) {
      return renderBuiltinResult("read", result, options, theme, context);
    },
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const needsExactPiRead =
        params.offset !== undefined || params.limit !== undefined || isProbablyImagePath(params.path);
      const currentStatus = await ensureStatus(ctx);
      if (needsExactPiRead || !commandSupported(currentStatus, "read")) {
        return executeBuiltin("read", toolCallId, params, signal, onUpdate, ctx, buildPiReadDisplay(params));
      }

      const readLevel = await chooseRtkReadLevel(ctx.cwd, params.path);
      const args =
        readLevel === "minimal"
          ? ["read", "--level", "minimal", "--max-lines", String(DEFAULT_MAX_LINES), params.path]
          : ["read", "--level", "none", params.path];
      try {
        const result = await runRtk(ctx, args, { signal });
        if (isSuccessLike(result)) {
          recordRtkHit(ctx, readLevel === "minimal" ? "read compact" : "read", formatRtkCommand(args));
          return buildTextResult(result.stdout || result.stderr, args, { exitCode: result.code, readLevel });
        }
      } catch {
        // Fall through to built-in read.
      }

      return executeBuiltin("read", toolCallId, params, signal, onUpdate, ctx, buildPiReadDisplay(params));
    },
  });

  pi.registerCommand("rtk", {
    description: "Run RTK commands exposed inside Pi (stats, clear-stats)",
    getArgumentCompletions(argumentPrefix: string) {
      const normalized = argumentPrefix.trimStart().toLowerCase();
      if (normalized.includes(" ")) {
        return null;
      }

      const completions = [
        { value: "stats", label: "stats", description: "Show RTK token savings summary and history" },
        { value: "clear-stats", label: "clear-stats", description: "Reset RTK token savings stats" },
      ];
      const matches = completions.filter((completion) => completion.value.startsWith(normalized));
      return matches.length > 0 ? matches : null;
    },
    handler: async (rawArgs: string, ctx: ExtensionCommandContext) => {
      const argv = splitShellArgs(rawArgs);
      const subcommand = argv[0];

      if (
        subcommand &&
        subcommand !== "stats" &&
        subcommand !== "clear-stats" &&
        subcommand !== "--help" &&
        subcommand !== "-h"
      ) {
        ctx.ui.notify("Usage: /rtk stats [options]\n       /rtk clear-stats", "warning");
        return;
      }

      if (subcommand === "--help" || subcommand === "-h") {
        ctx.ui.notify(
          "Usage: /rtk stats [options]\n       /rtk clear-stats\n\n`/rtk stats` shows RTK token savings. `/rtk clear-stats` resets RTK token savings stats.",
          "info",
        );
        return;
      }

      const currentStatus = await ensureStatus(ctx);
      if (!commandSupported(currentStatus, "gain")) {
        ctx.ui.notify(`${EXTENSION_NAME}: RTK stats are unavailable.`, "error");
        return;
      }

      const gainArgs =
        subcommand === "clear-stats"
          ? ["--reset", "--yes"]
          : subcommand === "stats"
            ? argv.slice(1)
            : argv;
      const customType = subcommand === "clear-stats" ? "rtk-clear-stats" : "rtk-stats";
      try {
        const commandDisplay = formatRtkCommand(["gain", ...gainArgs]);
        const result = await runRtk(ctx, ["gain", ...gainArgs], { timeout: RTK_TIMEOUT_MS });
        const output = stripAnsi(result.stdout || result.stderr || `rtk gain exited with code ${result.code}`);
        recordRtkHit(ctx, subcommand === "clear-stats" ? "clear-stats" : "stats", commandDisplay);
        pi.sendMessage({
          customType,
          content: trimOneTrailingNewline(output),
          display: true,
          details: {
            rtk: true,
            rtkCommand: commandDisplay,
            exitCode: result.code,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`${EXTENSION_NAME}: failed to run RTK stats (${message})`, "error");
      }
    },
  });
}
