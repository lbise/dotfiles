/**
 * Context Viewer Extension for pi
 *
 * Adds /context, an in-TUI viewer for the current easy-mode LLM context:
 * system prompt, active tool definitions, and the active session messages from
 * SessionManager.buildSessionContext().
 *
 * This is intentionally not the exact provider payload. It does not run a new
 * provider serialization pass, per-turn context hooks, or before_provider_request
 * hooks. Use it as a local, quick equivalent of inspecting /export or /share.
 */

import { buildSessionContext, type ExtensionAPI, type ExtensionCommandContext, type Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

type ContextDump = {
  generatedAt: string;
  cwd: string;
  session: {
    id: string;
    file?: string;
    name?: string;
    leafId: string | null;
  };
  model: unknown;
  thinkingLevel: string;
  contextUsage?: unknown;
  notes: string[];
  systemPrompt: string;
  activeTools: unknown[];
  messages: unknown[];
};

export default function (pi: ExtensionAPI) {
  pi.registerCommand("context", {
    description: "Show current LLM context in a modal",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/context is only available in interactive TUI mode.", "warning");
        return;
      }

      if (!ctx.isIdle()) {
        ctx.ui.notify("Waiting for the current agent turn before showing context...", "info");
        await ctx.waitForIdle();
      }

      const dump = buildContextDump(pi, ctx);
      const wantsJson = args.trim() === "json" || args.trim() === "--json";

      let disableMouseTracking: (() => void) | undefined;
      const cleanupMouseTracking = () => {
        disableMouseTracking?.();
        disableMouseTracking = undefined;
      };

      try {
        await ctx.ui.custom<void>(
          (tui, theme, _keybindings, done) => {
            enableMouseTracking(tui.terminal);
            disableMouseTracking = () => disableMouseTrackingFor(tui.terminal);
            const text = wantsJson ? stringifyJson(dump) : formatContextDump(dump, theme);
            return new ContextViewer(
              theme,
              text,
              dump,
              () => {
                cleanupMouseTracking();
                done(undefined);
              },
              () => tui.terminal.rows,
            );
          },
          {
            overlay: true,
            overlayOptions: {
              width: "90%",
              minWidth: 40,
              maxHeight: "85%",
              anchor: "center",
              margin: 1,
            },
          },
        );
      } finally {
        cleanupMouseTracking();
      }
    },
  });
}

function buildContextDump(pi: ExtensionAPI, ctx: ExtensionCommandContext): ContextDump {
  const sessionContext = buildSessionContext(ctx.sessionManager.getEntries(), ctx.sessionManager.getLeafId());
  const activeToolNames = pi.getActiveTools();
  const allToolsByName = new Map(pi.getAllTools().map((tool) => [tool.name, tool]));
  const activeTools = activeToolNames.map((name) => allToolsByName.get(name) ?? { name });
  const model = ctx.model
    ? {
        provider: ctx.model.provider,
        id: ctx.model.id,
        name: ctx.model.name,
        contextWindow: ctx.model.contextWindow,
        maxTokens: ctx.model.maxTokens,
      }
    : sessionContext.model;

  return {
    generatedAt: new Date().toISOString(),
    cwd: ctx.cwd,
    session: {
      id: ctx.sessionManager.getSessionId(),
      file: ctx.sessionManager.getSessionFile(),
      name: ctx.sessionManager.getSessionName(),
      leafId: ctx.sessionManager.getLeafId(),
    },
    model,
    thinkingLevel: pi.getThinkingLevel(),
    contextUsage: ctx.getContextUsage?.(),
    notes: [
      "Easy version: this shows Pi's current effective system prompt, active tool definitions, and SessionManager.buildSessionContext() messages.",
      "It does not include the /context command itself or the next prompt you have not submitted yet.",
      "It does not run per-turn before_agent_start/context hooks or provider-specific serialization.",
    ],
    systemPrompt: ctx.getSystemPrompt(),
    activeTools,
    messages: sessionContext.messages,
  };
}

function formatContextDump(dump: ContextDump, theme: Theme): string {
  const lines: string[] = [];

  lines.push(
    theme.fg("borderAccent", "╭──────── ") +
      theme.bold(theme.fg("accent", "Pi current context")) +
      theme.fg("borderAccent", " ────────╮"),
  );
  lines.push(theme.fg("dim", "Easy version: not the exact provider payload."));
  lines.push("");
  lines.push(theme.bold(theme.fg("warning", "Notes")));
  for (const note of dump.notes) {
    lines.push(`${theme.fg("warning", "•")} ${theme.fg("dim", escapeTerminalControls(note))}`);
  }

  addSection(lines, theme, "METADATA", "session, model, usage");
  addKeyValue(lines, theme, "generated", dump.generatedAt);
  addKeyValue(lines, theme, "cwd", dump.cwd);
  addKeyValue(lines, theme, "session id", dump.session.id);
  addKeyValue(lines, theme, "session file", dump.session.file ?? "in-memory");
  if (dump.session.name) addKeyValue(lines, theme, "session name", dump.session.name);
  addKeyValue(lines, theme, "leaf", dump.session.leafId ?? "none");
  addKeyValue(lines, theme, "thinking", dump.thinkingLevel);
  addKeyValue(lines, theme, "model", compactJson(dump.model));
  if (dump.contextUsage) addKeyValue(lines, theme, "context usage", compactJson(dump.contextUsage));

  addSection(lines, theme, "SYSTEM PROMPT", "current effective prompt");
  if (dump.systemPrompt) {
    pushIndentedText(lines, theme, escapeTerminalControls(dump.systemPrompt), "", "text");
  } else {
    lines.push(theme.fg("dim", "(empty)"));
  }

  addSection(lines, theme, "ACTIVE TOOLS", `${dump.activeTools.length} enabled`);
  if (dump.activeTools.length === 0) {
    lines.push(theme.fg("dim", "(no active tools)"));
  } else {
    dump.activeTools.forEach((tool, index) => formatTool(lines, theme, tool, index));
  }

  addSection(lines, theme, "MESSAGES", `${dump.messages.length} messages in buildSessionContext()`);
  if (dump.messages.length === 0) {
    lines.push(theme.fg("dim", "(no messages yet)"));
  } else {
    dump.messages.forEach((message, index) => formatMessage(lines, theme, message, index));
  }

  return lines.join("\n");
}

function addSection(lines: string[], theme: Theme, title: string, subtitle?: string): void {
  lines.push("");
  lines.push(
    theme.fg("borderAccent", "━━ ") +
      theme.bold(theme.fg("accent", title)) +
      (subtitle ? theme.fg("dim", `  ${subtitle}`) : "") +
      theme.fg("borderAccent", " ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"),
  );
}

function addKeyValue(lines: string[], theme: Theme, key: string, value: string): void {
  lines.push(`${theme.fg("dim", `${key}:`)} ${theme.fg("text", escapeTerminalControls(value))}`);
}

function formatTool(lines: string[], theme: Theme, tool: unknown, index: number): void {
  const item = asRecord(tool);
  const name = stringValue(item.name) ?? `tool-${index + 1}`;
  const description = stringValue(item.description);

  lines.push("");
  lines.push(
    `${theme.fg("toolTitle", theme.bold(`• ${name}`))}` +
      (description ? theme.fg("dim", ` — ${escapeTerminalControls(description)}`) : ""),
  );

  const sourceInfo = asRecord(item.sourceInfo);
  const sourceParts = [sourceInfo.source, sourceInfo.scope, sourceInfo.origin].filter((part) => typeof part === "string");
  if (sourceParts.length > 0) {
    lines.push(`  ${theme.fg("dim", `source: ${sourceParts.join(" / ")}`)}`);
  }

  if (item.parameters !== undefined) {
    lines.push(`  ${theme.fg("accent", "parameters")}`);
    pushJson(lines, theme, item.parameters, "    ");
  }

  if (Array.isArray(item.promptGuidelines) && item.promptGuidelines.length > 0) {
    lines.push(`  ${theme.fg("accent", "prompt guidelines")}`);
    for (const guideline of item.promptGuidelines) {
      if (typeof guideline === "string") {
        lines.push(`    ${theme.fg("warning", "- ")}${theme.fg("dim", escapeTerminalControls(guideline))}`);
      }
    }
  }
}

function formatMessage(lines: string[], theme: Theme, message: unknown, index: number): void {
  const item = asRecord(message);
  const role = stringValue(item.role) ?? "message";
  const roleLabel = role.toUpperCase();

  lines.push("");
  lines.push(
    theme.fg("border", "── ") +
      theme.bold(theme.fg(roleColor(role), `MESSAGE ${index + 1} · ${roleLabel}`)) +
      theme.fg("border", " ─────────────────────────────────"),
  );

  const meta: string[] = [];
  for (const key of ["provider", "model", "api", "stopReason", "toolName", "toolCallId", "customType"] as const) {
    const value = stringValue(item[key]);
    if (value) meta.push(`${key}=${value}`);
  }
  if (typeof item.isError === "boolean") meta.push(`isError=${item.isError}`);
  if (typeof item.timestamp === "number") meta.push(`timestamp=${new Date(item.timestamp).toISOString()}`);
  if (meta.length > 0) lines.push(theme.fg("dim", meta.join(" · ")));

  if (item.usage !== undefined) {
    lines.push(theme.fg("accent", "usage"));
    pushJson(lines, theme, item.usage, "  ");
  }

  if ("content" in item) {
    formatContent(lines, theme, item.content, "  ");
  } else {
    pushJson(lines, theme, item, "  ");
  }

  if (item.details !== undefined) {
    lines.push(theme.fg("accent", "details"));
    pushJson(lines, theme, item.details, "  ");
  }

  if (typeof item.summary === "string") {
    lines.push(theme.fg("accent", "summary"));
    pushIndentedText(lines, theme, escapeTerminalControls(item.summary), "  ", "text");
  }
}

function formatContent(lines: string[], theme: Theme, content: unknown, indent: string): void {
  if (typeof content === "string") {
    lines.push(`${indent}${theme.fg("accent", "content")}`);
    pushIndentedText(lines, theme, escapeTerminalControls(content), `${indent}  `, "text");
    return;
  }

  if (!Array.isArray(content)) {
    lines.push(`${indent}${theme.fg("accent", "content")}`);
    pushJson(lines, theme, content, `${indent}  `);
    return;
  }

  if (content.length === 0) {
    lines.push(`${indent}${theme.fg("dim", "(empty content)")}`);
    return;
  }

  for (const block of content) {
    const item = asRecord(block);
    const type = stringValue(item.type) ?? "unknown";

    if (type === "text") {
      lines.push(`${indent}${theme.fg("accent", "[text]")}`);
      pushIndentedText(lines, theme, escapeTerminalControls(stringValue(item.text) ?? ""), `${indent}  `, "text");
    } else if (type === "thinking") {
      lines.push(`${indent}${theme.fg("warning", "[thinking]")}`);
      pushIndentedText(lines, theme, escapeTerminalControls(stringValue(item.thinking) ?? ""), `${indent}  `, "dim");
    } else if (type === "toolCall") {
      const name = stringValue(item.name) ?? "unknown";
      const id = stringValue(item.id) ?? "unknown";
      lines.push(`${indent}${theme.fg("toolTitle", `[tool call] ${name}`)} ${theme.fg("dim", id)}`);
      if (item.arguments !== undefined) pushJson(lines, theme, item.arguments, `${indent}  `);
    } else if (type === "image") {
      const mimeType = stringValue(item.mimeType) ?? stringValue(asRecord(item.source).mediaType) ?? "unknown mime";
      const data = stringValue(item.data) ?? stringValue(asRecord(item.source).data);
      const size = data ? ` · ${data.length.toLocaleString()} base64 chars` : "";
      lines.push(`${indent}${theme.fg("warning", `[image] ${mimeType}${size}`)}`);
    } else {
      lines.push(`${indent}${theme.fg("accent", `[${type}]`)}`);
      pushJson(lines, theme, block, `${indent}  `);
    }
  }
}

function pushIndentedText(lines: string[], theme: Theme, text: string, indent: string, color: string): void {
  for (const line of text.split("\n")) {
    lines.push(`${indent}${theme.fg(color as any, line)}`);
  }
}

function pushJson(lines: string[], theme: Theme, value: unknown, indent: string): void {
  for (const line of stringifyJson(value).split("\n")) {
    lines.push(`${indent}${theme.fg("dim", line)}`);
  }
}

function compactJson(value: unknown): string {
  return stringifyJson(value).replace(/\n\s*/g, " ");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function roleColor(role: string): string {
  switch (role) {
    case "user":
      return "userMessageText";
    case "assistant":
      return "accent";
    case "toolResult":
      return "toolTitle";
    case "bashExecution":
      return "bashMode";
    case "custom":
      return "customMessageLabel";
    case "compactionSummary":
    case "branchSummary":
      return "warning";
    default:
      return "text";
  }
}

function stringifyJson(value: unknown): string {
  const seen = new WeakSet<object>();

  return JSON.stringify(
    value,
    (_key, item) => {
      if (typeof item === "bigint") return item.toString();
      if (typeof item === "function") return `[Function ${item.name || "anonymous"}]`;
      if (item instanceof Error) {
        return {
          name: item.name,
          message: item.message,
          stack: item.stack,
        };
      }
      if (item && typeof item === "object") {
        if (seen.has(item)) return "[Circular]";
        seen.add(item);
      }

      // Keep the dump valid JSON while avoiding accidental terminal control
      // sequences in command output, tool results, or context files.
      if (typeof item === "string") {
        return escapeTerminalControls(item);
      }

      return item;
    },
    2,
  ) ?? "undefined";
}

function escapeTerminalControls(value: string): string {
  return value.replace(/\u001b/g, "\\u001b");
}

class ContextViewer {
  private scroll = 0;
  private cachedWidth = 0;
  private cachedLines: string[] = [];

  constructor(
    private readonly theme: Theme,
    private readonly text: string,
    private readonly dump: ContextDump,
    private readonly done: () => void,
    private readonly getTerminalRows: () => number,
  ) {}

  handleInput(data: string): void {
    const pageSize = Math.max(1, this.getContentRows() - 1);
    const mouseDelta = parseMouseWheel(data);
    if (mouseDelta !== 0) {
      this.scrollBy(mouseDelta * 3);
      return;
    }

    if (matchesKey(data, "escape") || matchesKey(data, "q") || matchesKey(data, "ctrl+c")) {
      this.done();
      return;
    }

    if (matchesKey(data, "up") || matchesKey(data, "k")) {
      this.scrollBy(-1);
    } else if (matchesKey(data, "down") || matchesKey(data, "j")) {
      this.scrollBy(1);
    } else if (matchesKey(data, "pageUp") || matchesKey(data, "ctrl+b")) {
      this.scrollBy(-pageSize);
    } else if (matchesKey(data, "pageDown") || matchesKey(data, "ctrl+f") || matchesKey(data, "space")) {
      this.scrollBy(pageSize);
    } else if (matchesKey(data, "home") || matchesKey(data, "g")) {
      this.scroll = 0;
    } else if (matchesKey(data, "end") || matchesKey(data, "shift+g") || data === "G") {
      this.scroll = this.maxScroll();
    }
  }

  render(width: number): string[] {
    const w = Math.max(20, width);
    const innerW = Math.max(10, w - 2);
    const contentW = Math.max(8, innerW - 2);
    const lines = this.getWrappedLines(contentW);
    const contentRows = this.getContentRows();
    const maxScroll = Math.max(0, lines.length - contentRows);
    this.scroll = clamp(this.scroll, 0, maxScroll);

    const visible = lines.slice(this.scroll, this.scroll + contentRows);
    while (visible.length < contentRows) visible.push("");

    const title = this.theme.bold(this.theme.fg("accent", " Current LLM Context "));
    const meta = [
      `${this.dump.messages.length} messages`,
      `${this.dump.activeTools.length} tools`,
      `${this.dump.systemPrompt.length.toLocaleString()} system chars`,
      `${lines.length.toLocaleString()} lines`,
    ].join(" · ");
    const position = `${Math.min(this.scroll + 1, lines.length)}/${lines.length}`;

    return [
      this.border("╭", "╮", innerW),
      this.row(title, innerW),
      this.row(this.theme.fg("dim", ` ${meta} · ${position}`), innerW),
      this.border("├", "┤", innerW),
      ...visible.map((line) => this.row(line, innerW)),
      this.border("├", "┤", innerW),
      this.row(this.theme.fg("dim", " mouse wheel or ↑/↓/j/k scroll · PgUp/PgDn page · q/Esc close"), innerW),
      this.border("╰", "╯", innerW),
    ];
  }

  invalidate(): void {
    this.cachedWidth = 0;
    this.cachedLines = [];
  }

  private getWrappedLines(width: number): string[] {
    if (this.cachedWidth === width && this.cachedLines.length > 0) {
      return this.cachedLines;
    }

    const wrapped: string[] = [];
    for (const line of this.text.split("\n")) {
      const parts = wrapTextWithAnsi(line, width);
      wrapped.push(...parts);
    }

    this.cachedWidth = width;
    this.cachedLines = wrapped.length > 0 ? wrapped : [""];
    this.scroll = clamp(this.scroll, 0, this.maxScroll());
    return this.cachedLines;
  }

  private getContentRows(): number {
    // Keep this aligned with overlayOptions.maxHeight: "85%". Seven non-content
    // rows are rendered: top, title, meta, separator, footer separator, help,
    // bottom. Leave at least three content rows for very small terminals.
    const maxOverlayRows = Math.max(9, Math.floor(this.getTerminalRows() * 0.85));
    return Math.max(3, maxOverlayRows - 7);
  }

  private maxScroll(): number {
    return Math.max(0, this.cachedLines.length - this.getContentRows());
  }

  private scrollBy(delta: number): void {
    this.scroll = clamp(this.scroll + delta, 0, this.maxScroll());
  }

  private border(left: string, right: string, innerW: number): string {
    return this.theme.fg("border", `${left}${"─".repeat(innerW)}${right}`);
  }

  private row(content: string, innerW: number): string {
    const contentW = Math.max(0, innerW - 2);
    const safe = truncateToWidth(content, contentW, "…");
    const padded = safe + " ".repeat(Math.max(0, contentW - visibleWidth(safe)));
    return this.theme.fg("border", "│") + " " + padded + " " + this.theme.fg("border", "│");
  }
}

function enableMouseTracking(terminal: { write(data: string): void }): void {
  // 1000 = button/wheel events, 1006 = SGR coordinates. Wheel events are
  // delivered to the focused component as ESC[<64;x;yM / ESC[<65;x;yM.
  terminal.write("\x1b[?1000h\x1b[?1006h");
}

function disableMouseTrackingFor(terminal: { write(data: string): void }): void {
  terminal.write("\x1b[?1006l\x1b[?1000l");
}

function parseMouseWheel(data: string): number {
  const match = /^\x1b\[<(\d+);\d+;\d+M$/.exec(data);
  if (!match) return 0;

  const button = Number(match[1]);
  if (!Number.isFinite(button)) return 0;

  // Strip Shift/Alt/Ctrl modifier bits (4/8/16) and keep the wheel code.
  const wheelCode = button & ~0b11100;
  if (wheelCode === 64) return -1; // wheel up
  if (wheelCode === 65) return 1; // wheel down
  return 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
