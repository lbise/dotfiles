import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Markdown, type Component, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

import type { TaskProgress } from "./runner.ts";

type Theme = ExtensionContext["ui"]["theme"];
type RenderResult = {
  content: Array<{ type: string; text?: string }>;
  details?: unknown;
};
type RenderOptions = { expanded: boolean; isPartial: boolean };
type HeaderColor = "accent" | "success" | "warning" | "error";
type DelegateResultDetails = Partial<TaskProgress> & { output?: string; background?: boolean };
type DelegateRenderState = { row?: DelegateToolRow };

type RoundedBoxOptions = {
  title: string;
  titleColor: HeaderColor;
  lines: string[];
};

class RoundedBox implements Component {
  constructor(
    private readonly options: RoundedBoxOptions,
    private readonly theme: Theme,
  ) {}

  render(width: number): string[] {
    if (width < 8) return this.options.lines.flatMap((line) => wrapTextWithAnsi(line, Math.max(1, width)));

    const interiorWidth = width - 2;
    const contentWidth = interiorWidth - 2;
    const title = truncateToWidth(this.options.title, Math.max(1, interiorWidth - 3), "");
    const titleWidth = visibleWidth(title);
    const top =
      this.theme.fg("borderAccent", "╭─ ") +
      this.theme.fg(this.options.titleColor, title) +
      this.theme.fg("borderAccent", ` ${"─".repeat(Math.max(0, interiorWidth - titleWidth - 3))}╮`);
    const bottom = this.theme.fg("borderAccent", `╰${"─".repeat(interiorWidth)}╯`);
    const body = this.options.lines.flatMap((line) => wrapTextWithAnsi(line, contentWidth)).map((line) => {
      const fitted = truncateToWidth(line, contentWidth);
      const padding = " ".repeat(Math.max(0, contentWidth - visibleWidth(fitted)));
      return this.theme.fg("borderAccent", "│") + ` ${fitted}${padding} ` + this.theme.fg("borderAccent", "│");
    });
    return [top, ...body, bottom];
  }

  invalidate(): void {}
}

class EmptyComponent implements Component {
  render(): string[] {
    return [];
  }

  invalidate(): void {}
}

function agentIcon(agent: string): string {
  if (agent === "explore") return "󰉋";
  if (agent === "general") return "󰚩";
  return "󰆍";
}

function statusIcon(status: string): string {
  if (status === "completed") return "󰄬";
  if (status === "failed") return "󰅖";
  if (status === "aborted") return "󰜺";
  if (status === "queued") return "󰔛";
  return "󰑮";
}

function statusColor(status: string): HeaderColor {
  if (status === "completed") return "success";
  if (status === "failed" || status === "aborted") return "error";
  return "warning";
}

function activityIcon(activity: string): string {
  if (activity.startsWith("failed")) return "󰅖";
  if (activity.startsWith("finished")) return "󰄬";
  return "󰑮";
}

function usageText(details: DelegateResultDetails): string | undefined {
  const usage = [
    details.turns ? `${details.turns} turn${details.turns === 1 ? "" : "s"}` : undefined,
    details.tokens ? `${details.tokens} tokens` : undefined,
    details.cost ? `$${details.cost.toFixed(4)}` : undefined,
  ].filter(Boolean).join(" · ");
  return usage || undefined;
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function toolAction(tool: string): string {
  switch (tool) {
    case "read": return "reading";
    case "grep": return "searching";
    case "find": return "finding files";
    case "ls": return "listing files";
    case "bash": return "running a command";
    case "edit": return "editing";
    case "write": return "writing";
    default: return `using ${tool}`;
  }
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1_000) return `${Math.max(0, milliseconds)}ms`;
  if (milliseconds < 60_000) return `${(milliseconds / 1_000).toFixed(1)}s`;
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1_000);
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function delegateBoxWidth(availableWidth: number, title: string, lines: string[]): number {
  const widest = Math.max(visibleWidth(title), ...lines.map(visibleWidth), 0);
  const preferred = Math.max(40, widest + 4);
  return Math.min(availableWidth, 96, preferred);
}

class DelegateToolRow implements Component {
  #args: Record<string, unknown>;
  #theme: Theme;
  #executionStarted = false;
  #spinnerFrame = 0;
  #startedAt = Date.now();
  #finishedAt?: number;
  #spinnerTimer?: ReturnType<typeof setInterval>;
  #invalidate?: () => void;
  #result?: { result: RenderResult; options: RenderOptions; isError: boolean };

  constructor(args: Record<string, unknown>, theme: Theme) {
    this.#args = args;
    this.#theme = theme;
  }

  updateCall(args: Record<string, unknown>, theme: Theme, executionStarted: boolean): void {
    this.#args = args;
    this.#theme = theme;
    this.#executionStarted = executionStarted;
  }

  startSpinner(invalidate: () => void): void {
    this.#invalidate = invalidate;
    if (this.#spinnerTimer) return;
    this.#spinnerTimer = setInterval(() => {
      if (this.#result && !this.#result.options.isPartial) {
        this.stopSpinner();
        return;
      }
      this.#spinnerFrame = (this.#spinnerFrame + 1) % SPINNER_FRAMES.length;
      this.#invalidate?.();
    }, 120);
  }

  stopSpinner(): void {
    if (this.#spinnerTimer) clearInterval(this.#spinnerTimer);
    this.#spinnerTimer = undefined;
    this.#invalidate = undefined;
  }

  updateResult(
    result: RenderResult,
    options: RenderOptions,
    theme: Theme,
    isError: boolean,
    invalidate: () => void,
  ): void {
    this.#result = { result, options, isError };
    this.#theme = theme;
    if (options.isPartial) {
      this.startSpinner(invalidate);
    } else {
      this.#finishedAt ??= Date.now();
      this.stopSpinner();
    }
  }

  render(width: number): string[] {
    const agent = typeof this.#args.subagent_type === "string" ? this.#args.subagent_type : "delegate";
    const mode = this.#args.mode === "background" ? "background" : "foreground";
    const title = typeof this.#args.title === "string" ? this.#args.title : "...";
    const details = this.#result?.result.details as DelegateResultDetails | undefined;
    const status = details?.status ?? (
      this.#result?.isError ? "failed" :
      this.#result ? (this.#result.options.isPartial ? "running" : "completed") :
      this.#executionStarted ? "running" : "queued"
    );
    const output = details?.output || (this.#result?.isError ? this.#result.result.content
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n") : undefined);
    const expanded = this.#result?.options.expanded ?? false;
    const lines = [this.#theme.fg("dim", `${agentIcon(agent)} ${details?.title ?? title}`)];
    const action = details?.currentTool
      ? `${SPINNER_FRAMES[this.#spinnerFrame]} ${toolAction(details.currentTool)}`
      : status === "running" || status === "queued"
        ? `${SPINNER_FRAMES[this.#spinnerFrame]} thinking`
        : `${statusIcon(status)} ${status}`;
    lines.push(this.#theme.fg(statusColor(status), action));

    if (expanded) {
      if (details?.activity?.length) {
        lines.push("");
        lines.push(...details.activity.map((activity) => this.#theme.fg("muted", `${activityIcon(activity)} ${activity}`)));
      }
      if (output) {
        lines.push("");
        lines.push(...new Markdown(output, 0, 0, getMarkdownTheme()).render(1_000));
      }
    }

    const usage = usageText(details ?? {});
    const modelDetails = [
      details?.model ? `󰘦 ${details.model}` : undefined,
      details?.thinking ? `󰊌 ${details.thinking}` : undefined,
    ].filter(Boolean).join(" · ");
    const duration = formatDuration((this.#finishedAt ?? Date.now()) - this.#startedAt);
    const usageDetails = [`󰥔 ${duration}`, usage ? `󰍛 ${usage}` : undefined].filter(Boolean).join(" · ");
    lines.push("");
    if (modelDetails) lines.push(this.#theme.fg("dim", modelDetails));
    lines.push(this.#theme.fg("dim", usageDetails));
    if (details?.taskId) lines.push(this.#theme.fg("dim", `󰆧 ${details.taskId}`));

    const shortcut = details?.shortcut ? ` · ${details.shortcut}` : "";
    const boxTitle = `󰆍 delegate · ${agent} · ${mode}${shortcut}`;
    return new RoundedBox({
      title: boxTitle,
      titleColor: "accent",
      lines,
    }, this.#theme).render(delegateBoxWidth(width, boxTitle, lines));
  }

  invalidate(): void {}

  dispose(): void {
    this.stopSpinner();
  }
}

function state(value: unknown): DelegateRenderState {
  return value as DelegateRenderState;
}

export function renderDelegateCall(args: Record<string, unknown>, theme: Theme, context: {
  state: unknown;
  executionStarted: boolean;
  invalidate: () => void;
}): Component {
  const rendererState = state(context.state);
  const row = rendererState.row ??= new DelegateToolRow(args, theme);
  row.updateCall(args, theme, context.executionStarted);
  row.startSpinner(context.invalidate);
  return row;
}

export function renderDelegateResult(
  result: RenderResult,
  options: RenderOptions,
  theme: Theme,
  context: { args: Record<string, unknown>; state: unknown; isError: boolean; invalidate: () => void },
): Component {
  const rendererState = state(context.state);
  const row = rendererState.row ??= new DelegateToolRow(context.args, theme);
  row.updateResult(result, options, theme, context.isError, context.invalidate);
  return new EmptyComponent();
}
