import type { Segment, Tone, UsageWindow } from "./types.ts";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const BAR_WIDTH = 8;

export function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function getHeader(headers: Record<string, string>, name: string): string | undefined {
  if (headers[name] !== undefined) return headers[name];
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) return value;
  }
  return undefined;
}

export function formatAmount(value: number): string {
  if (Number.isInteger(value)) return String(value);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function percentTone(percentUsed: number): Tone {
  if (percentUsed >= 90) return "error";
  if (percentUsed >= 70) return "warning";
  return "success";
}

/** Nerd Font glyphs, so usage reads like the footer's other "<icon> value" widgets. */
export const ICONS = {
  hours: "\u{f0150}", // md-clock_outline
  days: "\u{f00ed}", // md-calendar
  week: "\u{f0a33}", // md-calendar_week
  month: "\u{f0e17}", // md-calendar_month
  reset: "\u{f0450}", // md-refresh
  money: "\u{f0114}", // md-cash
} as const;

/** "14.8k" style count for large quotas. */
export function formatCount(value: number): string {
  if (Math.abs(value) < 1000) return formatAmount(Math.round(value * 10) / 10);
  return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`;
}

export function formatBar(percentUsed: number, tone?: Tone): Segment[] {
  const display = Math.max(0, percentUsed);
  const clamped = Math.min(100, display);
  const filled = clamped === 0 ? 0 : Math.min(BAR_WIDTH, Math.max(1, Math.round((clamped / 100) * BAR_WIDTH)));
  const color = tone ?? percentTone(display);

  return [
    { text: "█".repeat(filled), tone: color },
    { text: "░".repeat(BAR_WIDTH - filled), tone: "dim" },
    { text: ` ${formatAmount(display)}%`, tone: color },
  ];
}

/** "<icon> ████░░░░ 53.9% 14.8k/27.5k" */
export function formatWindow(window: UsageWindow): Segment[] {
  const color = window.tone ?? percentTone(Math.max(0, window.usedPercent));
  const segments: Segment[] = [{ text: `${window.icon} `, tone: color }, ...formatBar(window.usedPercent, window.tone)];
  if (window.used !== undefined && window.limit !== undefined) {
    segments.push({ text: ` ${formatCount(window.used)}/${formatCount(window.limit)}`, tone: "dim" });
  }
  if (window.note?.length) segments.push({ text: " " }, ...window.note);
  return segments;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * "<icon> 2h15m 14:30" within a day, "<icon> 17d 01.11" beyond, or null when
 * the time is unknown.
 */
export function formatReset(resetsAt: number | undefined, now = Date.now()): string | null {
  if (resetsAt === undefined) return null;
  const parsed = new Date(resetsAt);
  if (Number.isNaN(parsed.getTime())) return null;

  const remaining = Math.max(0, resetsAt - now);
  const time = `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
  const date = `${pad(parsed.getDate())}.${pad(parsed.getMonth() + 1)}`;
  let text: string;
  if (remaining === 0) {
    text = "now";
  } else if (remaining < HOUR_MS) {
    text = `${Math.max(1, Math.ceil(remaining / MINUTE_MS))}m ${time}`;
  } else if (remaining < DAY_MS) {
    const hours = Math.floor(remaining / HOUR_MS);
    const mins = Math.round((remaining % HOUR_MS) / MINUTE_MS);
    text = `${hours}h${mins > 0 ? `${mins}m` : ""} ${time}`;
  } else {
    text = `${Math.ceil(remaining / DAY_MS)}d ${date}`;
  }
  return `${ICONS.reset} ${text}`;
}

/** Icon for a rolling window given its length in minutes. */
export function windowIcon(minutes: number | undefined, fallbackMinutes: number): string {
  const length = minutes && minutes > 0 ? minutes : fallbackMinutes;
  if (length >= 28 * 24 * 60) return ICONS.month;
  if (length >= 7 * 24 * 60 - 60) return ICONS.week;
  if (length >= 24 * 60) return ICONS.days;
  return ICONS.hours;
}

export function renderSegments(
  segments: Segment[],
  theme: { fg(color: Tone, text: string): string; bold(text: string): string }
): string {
  return segments
    .filter((segment) => segment.text.length > 0)
    .map((segment) => {
      const colored = segment.tone ? theme.fg(segment.tone, segment.text) : segment.text;
      return segment.bold ? theme.bold(colored) : colored;
    })
    .join("");
}
