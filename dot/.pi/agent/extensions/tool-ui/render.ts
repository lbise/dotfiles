import { homedir } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { keyHint, type Theme } from "@earendil-works/pi-coding-agent";
import {
  Container,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
  type Component,
} from "@earendil-works/pi-tui";

export const COLLAPSED_PREVIEW_LINES = 8;
export const COLLAPSED_SHELL_LINES = 6;
export const COLLAPSED_DIFF_LINES = 24;
export const EXPANDED_PREVIEW_LINES = 4_000;

export type ToolStatus = "waiting" | "running" | "success" | "error";

export type RenderLifecycle = {
  executionStarted: boolean;
  isPartial: boolean;
  isError: boolean;
};

export type PreviewContent = {
  lines: string[];
  expanded: boolean;
  collapsedLines?: number;
  expandedLines?: number;
  collapsedFrom?: "start" | "end";
  fillBackgroundLines?: boolean;
  footer?: string;
};

function normalizedWidth(width: number): number {
  return Number.isFinite(width) ? Math.max(0, Math.floor(width)) : 0;
}

function normalizeLines(text: string): string[] {
  if (!text) return [];
  const lines = text.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  while (lines.at(-1) === "") lines.pop();
  return lines.map((line) => line.replaceAll("\t", "    "));
}

const ANSI_BACKGROUND_PATTERN = /\x1b\[(?:4[0-9]|10[0-7]|48)(?:;[^m]*)?m/;

/** Extend an ANSI background through the remaining width without coloring plain lines. */
export function fillAnsiBackground(line: string, width: number): string {
  if (width <= 0 || !ANSI_BACKGROUND_PATTERN.test(line)) return line;
  const missing = width - visibleWidth(line);
  if (missing <= 0) return line;

  const padding = " ".repeat(missing);
  const resetIndex = line.lastIndexOf("\x1b[0m");
  if (resetIndex >= 0) {
    return `${line.slice(0, resetIndex)}${padding}${line.slice(resetIndex)}`;
  }
  return `${line}${padding}\x1b[0m`;
}

export function extractText(result: { content?: Array<{ type: string; text?: string }> }): string {
  return (result.content ?? [])
    .filter((item): item is { type: "text"; text: string } => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n");
}

export function splitOutput(text: string): string[] {
  return normalizeLines(text);
}

export function shortenPath(input: unknown, cwd: string): string {
  if (typeof input !== "string" || input.length === 0) return "…";

  if (isAbsolute(input)) {
    const fromCwd = relative(resolve(cwd), resolve(input));
    if (fromCwd === "") return ".";
    if (fromCwd !== ".." && !fromCwd.startsWith(`..${sep}`) && !isAbsolute(fromCwd)) return fromCwd;

    const home = homedir();
    if (input === home) return "~";
    if (input.startsWith(`${home}${sep}`)) return `~${input.slice(home.length)}`;
  }

  return input;
}

export function lifecycleStatus(context: RenderLifecycle): ToolStatus {
  if (!context.executionStarted) return "waiting";
  if (context.isPartial) return "running";
  return context.isError ? "error" : "success";
}

/** A one-line ANSI-aware component. Tool headers should never wrap into the output. */
export class AnsiLine implements Component {
  private width?: number;
  private lines?: string[];

  constructor(private text = "") {}

  setText(text: string): void {
    if (text === this.text) return;
    this.text = text;
    this.invalidate();
  }

  render(width: number): string[] {
    const safeWidth = normalizedWidth(width);
    if (this.lines && this.width === safeWidth) return this.lines;
    this.width = safeWidth;
    this.lines = [safeWidth === 0 ? "" : truncateToWidth(this.text, safeWidth, "…")];
    return this.lines;
  }

  invalidate(): void {
    this.width = undefined;
    this.lines = undefined;
  }
}

/** ANSI-aware output preview with hard width and height limits. */
export class OutputPreview implements Component {
  private width?: number;
  private rendered?: string[];

  constructor(
    private content: PreviewContent,
    private theme: Theme,
  ) {}

  setContent(content: PreviewContent, theme: Theme = this.theme): void {
    this.content = content;
    this.theme = theme;
    this.invalidate();
  }

  render(width: number): string[] {
    const safeWidth = normalizedWidth(width);
    if (this.rendered && this.width === safeWidth) return this.rendered;
    this.width = safeWidth;

    if (safeWidth === 0) {
      this.rendered = [""];
      return this.rendered;
    }

    const { lines, expanded } = this.content;
    const limit = expanded
      ? Math.max(0, this.content.expandedLines ?? EXPANDED_PREVIEW_LINES)
      : Math.max(0, this.content.collapsedLines ?? COLLAPSED_PREVIEW_LINES);
    const fromEnd = !expanded && this.content.collapsedFrom === "end";
    const shown = limit === 0 ? [] : fromEnd ? lines.slice(-limit) : lines.slice(0, limit);
    const omitted = Math.max(0, lines.length - shown.length);
    const prefix = this.theme.fg("accent", "│ ");
    const prefixWidth = visibleWidth(prefix);
    const innerWidth = Math.max(0, safeWidth - prefixWidth);
    const rendered: string[] = [];

    for (const line of shown) {
      if (innerWidth === 0) {
        rendered.push(truncateToWidth(prefix, safeWidth, ""));
        continue;
      }
      const wrapped = expanded ? wrapTextWithAnsi(line, innerWidth) : [truncateToWidth(line, innerWidth, "…")];
      for (const segment of wrapped.length > 0 ? wrapped : [""]) {
        const filled = this.content.fillBackgroundLines
          ? fillAnsiBackground(segment, innerWidth)
          : segment;
        rendered.push(truncateToWidth(`${prefix}${filled}`, safeWidth, ""));
      }
    }

    const footer = this.footer(omitted, fromEnd);
    if (footer) {
      const prefix = this.theme.fg("accent", "│ ");
      rendered.push(truncateToWidth(`${prefix}${this.theme.fg("muted", footer)}`, safeWidth, "…"));
    }

    this.rendered = rendered;
    return rendered;
  }

  invalidate(): void {
    this.width = undefined;
    this.rendered = undefined;
  }

  private footer(omitted: number, omittedFromStart: boolean): string {
    const parts: string[] = [];
    if (omitted > 0) {
      if (this.content.expanded) {
        parts.push(`display capped at ${this.content.expandedLines ?? EXPANDED_PREVIEW_LINES} of ${this.content.lines.length} lines`);
      } else {
        parts.push(`${omitted} ${omittedFromStart ? "earlier" : "more"} lines`);
        parts.push(keyHint("app.tools.expand", "to expand"));
      }
    }
    if (this.content.footer) parts.push(this.content.footer);
    return parts.join(" · ");
  }
}

export class ToolCallDisplay extends Container {
  private readonly header = new AnsiLine();
  private body?: Component;
  private label = "";
  private target = "";
  private metadata = "";
  private status: ToolStatus = "waiting";
  private theme?: Theme;

  constructor() {
    super();
    this.addChild(this.header);
  }

  update(
    label: string,
    target: string,
    metadata: string,
    status: ToolStatus,
    theme: Theme,
    body?: Component,
  ): void {
    this.label = label;
    this.target = target;
    this.metadata = metadata;
    this.status = status;
    this.theme = theme;

    if (this.body && this.body !== body) this.removeChild(this.body);
    if (body && this.body !== body) this.addChild(body);
    this.body = body;
    this.rebuildHeader();
    super.invalidate();
  }

  updateStatus(status: ToolStatus, theme: Theme): void {
    this.status = status;
    this.theme = theme;
    this.rebuildHeader();
    super.invalidate();
  }

  override invalidate(): void {
    super.invalidate();
    this.rebuildHeader();
  }

  private rebuildHeader(): void {
    if (!this.theme) return;
    const target = this.target ? ` ${this.theme.fg("accent", this.target)}` : "";
    const metadata = this.metadata ? ` ${this.theme.fg("muted", this.metadata)}` : "";
    const rule = this.theme.fg("accent", "│");
    this.header.setText(
      `${rule} ${this.theme.fg("toolTitle", this.theme.bold(this.label))}${target}${metadata}`,
    );
  }
}

