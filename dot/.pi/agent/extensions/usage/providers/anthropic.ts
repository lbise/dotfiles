/**
 * Claude Pro/Max subscription usage.
 *
 * Endpoint: https://api.anthropic.com/api/oauth/usage (undocumented, the one
 * Claude Code's /usage uses). Reports the plan's 5h and weekly windows plus
 * "extra usage", the pay-as-you-go pool. Anthropic bills third-party apps
 * such as pi against extra usage, not the plan windows, so extra usage is
 * what pi actually consumes.
 */

import { formatAmount, formatBar, numberValue } from "../format.ts";
import type { AuthSource, Segment, UsageProvider, UsageSnapshot, UsageWindow } from "../types.ts";

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";

type WindowRaw = { utilization?: number | null; resets_at?: string | null } | null;

type ExtraUsageRaw = {
  is_enabled?: boolean;
  monthly_limit?: number | null;
  used_credits?: number | null;
  utilization?: number | null;
  currency?: string | null;
  decimal_places?: number | null;
  spend_limit_reached?: boolean;
} | null;

type UsagePayload = {
  five_hour?: WindowRaw;
  seven_day?: WindowRaw;
  extra_usage?: ExtraUsageRaw;
};

function windowFromRaw(raw: WindowRaw | undefined, label: string): UsageWindow | undefined {
  const usedPercent = numberValue(raw?.utilization);
  if (usedPercent === undefined) return undefined;
  const resetsAt = raw?.resets_at ? Date.parse(raw.resets_at) : NaN;
  return { label, usedPercent, resetsAt: Number.isNaN(resetsAt) ? undefined : resetsAt };
}

function formatMoney(minor: number, decimals: number, currency: string | null | undefined): string {
  const amount = formatAmount(minor / 10 ** decimals);
  if (!currency || currency === "USD") return `$${amount}`;
  return `${amount} ${currency}`;
}

function extraSegments(extra: ExtraUsageRaw | undefined): Segment[] | undefined {
  if (!extra) return undefined;
  if (!extra.is_enabled) return [{ text: "extra off", tone: "warning" }];

  const segments: Segment[] = [{ text: "extra ", tone: "dim" }];
  const utilization = numberValue(extra.utilization);
  if (utilization !== undefined) {
    segments.push(...formatBar(utilization, extra.spend_limit_reached ? "error" : undefined));
  }

  const used = numberValue(extra.used_credits);
  if (used !== undefined) {
    const decimals = numberValue(extra.decimal_places) ?? 2;
    const limit = numberValue(extra.monthly_limit);
    const text =
      formatMoney(used, decimals, extra.currency) +
      (limit !== undefined ? `/${formatMoney(limit, decimals, extra.currency)}` : "");
    segments.push({ text: utilization !== undefined ? ` (${text})` : text, tone: "dim" });
  }
  return segments;
}

export function snapshotFromPayload(payload: UsagePayload): UsageSnapshot {
  const primary = windowFromRaw(payload.five_hour, "5h");
  return {
    primary,
    secondary: windowFromRaw(payload.seven_day, "week"),
    summary: primary ? undefined : [{ text: "active", tone: "dim" }],
    extra: extraSegments(payload.extra_usage),
  };
}

export const anthropicProvider: UsageProvider = {
  id: "anthropic",
  name: "Claude",
  cacheTtlMs: 60 * 1000,

  async fetchUsage(auth: AuthSource): Promise<UsageSnapshot> {
    const token = await auth.apiKey("anthropic");
    if (!token) throw new Error("no token");
    if (!token.startsWith("sk-ant-oat")) throw new Error("not a subscription login");

    const response = await fetch(USAGE_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-beta": "oauth-2025-04-20",
        Accept: "application/json",
      },
    });
    if (!response.ok) throw new Error(`usage API returned ${response.status}`);
    return snapshotFromPayload((await response.json()) as UsagePayload);
  },
};
