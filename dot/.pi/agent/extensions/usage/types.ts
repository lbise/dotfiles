/** Theme colors a provider may use. Rendering maps these onto pi's Theme. */
export type Tone = "dim" | "success" | "warning" | "error";

/** A styled text fragment. Providers describe output as segments so they stay theme-free and testable. */
export type Segment = { text: string; tone?: Tone; bold?: boolean };

export type UsageWindow = {
  /** Nerd Font glyph shown before the bar; see ICONS and windowIcon(). */
  icon: string;
  /** Window name for plain-text consumers: "5h", "Week", "Month"; see windowLabel(). */
  label?: string;
  usedPercent: number;
  /** Epoch milliseconds. */
  resetsAt?: number;
  /** Absolute usage, shown as "(used/limit)" when both are known. */
  used?: number;
  limit?: number;
  /** Pace position in percent, drawn as "│" in the bar. */
  markerPercent?: number;
  /** Overrides the percent-based bar color. */
  tone?: Tone;
  /** Extra segments appended after the bar. */
  note?: Segment[];
};

export type UsageSnapshot = {
  primary?: UsageWindow;
  secondary?: UsageWindow;
  /** Shown in place of the primary window when the provider reports none (e.g. "unlimited"). */
  summary?: Segment[];
  /** Name of what the summary measures, e.g. "Month". */
  summaryLabel?: string;
  /** Provider-specific extras: credits balance, extra usage, ... Rendered after a money icon. */
  extra?: Segment[];
};

export type PiAuthEntry = {
  type?: string;
  access?: string;
  refresh?: string;
  expires?: number;
  accountId?: string;
};

export type AuthSource = {
  /** Current bearer token for a pi provider, refreshed by pi when it expires. */
  apiKey(provider: string): Promise<string | undefined>;
  /** Raw entry from ~/.pi/agent/auth.json, for fields pi does not expose (refresh token, accountId). */
  authEntry(provider: string): Promise<PiAuthEntry | undefined>;
};

/** Per-prompt accounting, created fresh at each agent_start. */
export interface PromptTracker {
  /** Accounts one finished turn's assistant message. */
  turnEnd(message: unknown): void;
  /** Extra status segments for the prompt so far; replaces snapshot.extra until the next prompt. */
  segments(): Segment[];
}

export interface UsageProvider {
  /** pi provider id, e.g. "anthropic". */
  id: string;
  /** Display name for errors and notifications. */
  name: string;
  cacheTtlMs: number;
  /** Name of what snapshot.extra shows, e.g. "Credits". */
  extraLabel?: string;
  fetchUsage(auth: AuthSource): Promise<UsageSnapshot>;
  /** Update usage from provider response headers without an extra request. */
  usageFromHeaders?(headers: Record<string, string>, previous: UsageSnapshot | null): UsageSnapshot | null;
  createPromptTracker?(): PromptTracker;
}
