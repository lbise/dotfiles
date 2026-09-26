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

export function formatWindow(window: UsageWindow): Segment[] {
  const segments: Segment[] = [{ text: `${window.label} `, tone: "dim" }, ...formatBar(window.usedPercent, window.tone)];
  if (window.used !== undefined && window.limit !== undefined) {
    segments.push({ text: ` (${formatAmount(window.used)}/${formatAmount(window.limit)})`, tone: "dim" });
  }
  if (window.note?.length) segments.push({ text: " · ", tone: "dim" }, ...window.note);
  return segments;
}

/** "Reset 2h 15m (25.09)" style text, or null when the time is unknown. */
export function formatReset(resetsAt: number | undefined, now = Date.now()): string | null {
  if (resetsAt === undefined) return null;
  const parsed = new Date(resetsAt);
  if (Number.isNaN(parsed.getTime())) return null;

  const remaining = Math.max(0, resetsAt - now);
  let relative: string;
  if (remaining === 0) {
    relative = "Reset now";
  } else if (remaining < HOUR_MS) {
    relative = `Reset ${Math.max(1, Math.ceil(remaining / MINUTE_MS))}m`;
  } else if (remaining < DAY_MS) {
    const hours = Math.floor(remaining / HOUR_MS);
    const mins = Math.round((remaining % HOUR_MS) / MINUTE_MS);
    relative = `Reset ${hours}h${mins > 0 ? ` ${mins}m` : ""}`;
  } else {
    const days = Math.ceil(remaining / DAY_MS);
    relative = `Reset ${days} day${days === 1 ? "" : "s"}`;
  }

  const date = `${String(parsed.getDate()).padStart(2, "0")}.${String(parsed.getMonth() + 1).padStart(2, "0")}`;
  return `${relative} (${date})`;
}

/** Label for a rolling window given its length in minutes. */
export function windowLabel(minutes: number | undefined, fallback: string): string {
  if (!minutes || minutes <= 0) return fallback;
  if (minutes >= 7 * 24 * 60 - 60) return "week";
  if (minutes >= 24 * 60) return `${Math.round(minutes / (24 * 60))}d`;
  if (minutes >= 60) return `${Math.round(minutes / 60)}h`;
  return `${minutes}m`;
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
