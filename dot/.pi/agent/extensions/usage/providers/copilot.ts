/**
 * GitHub Copilot premium request usage.
 *
 * Endpoint: https://api.github.com/copilot_internal/user (undocumented).
 * Copilot also sends x-quota-snapshot-* headers on every response.
 *
 * Token source, in order: pi's github-copilot refresh token (the GitHub OAuth
 * token), GITHUB_TOKEN, GitHub CLI's hosts.yml.
 *
 * GitHub books token-billed usage in batches a few minutes after the requests,
 * so the quota lags behind a running prompt. The prompt tracker fills the gap
 * with pi's token-priced USD cost at GitHub's documented 1 AI credit = $0.01,
 * which matched the booked quota delta exactly when measured. Polling picks
 * up the booked value once it lands.
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { formatAmount, getHeader, ICONS, numberValue } from "../format.ts";
import type { AuthSource, PromptTracker, UsageProvider, UsageSnapshot } from "../types.ts";

const USAGE_URL = "https://api.github.com/copilot_internal/user";
const CREDIT_USD = 0.01;

const COPILOT_HEADERS = {
  Accept: "application/json",
  "Editor-Version": "vscode/1.107.0",
  "Editor-Plugin-Version": "copilot-chat/0.35.0",
  "User-Agent": "GitHubCopilotChat/0.35.0",
  "Copilot-Integration-Id": "vscode-chat",
};

type QuotaSnapshotRaw = {
  percent_remaining?: number;
  quota_remaining?: number;
  remaining?: number;
  entitlement?: number | string;
  unlimited?: boolean;
  overage_count?: number;
  reset_date?: string;
};

type UserInfo = {
  copilot_plan?: string;
  quota_reset_date?: string;
  quota_reset_date_utc?: string;
  quota_snapshots?: {
    premium_models?: QuotaSnapshotRaw;
    premium_interactions?: QuotaSnapshotRaw;
  };
};

type Quota = {
  entitlement?: number;
  remaining?: number;
  percentRemaining?: number;
  unlimited?: boolean;
  overageCount?: number;
  resetDate?: string;
};

async function getGitHubToken(auth: AuthSource): Promise<string | null> {
  const piToken = (await auth.authEntry("github-copilot"))?.refresh;
  if (piToken) return piToken;
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;

  const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  try {
    const raw = await readFile(join(configHome, "gh", "hosts.yml"), "utf8");
    const match = raw.match(/github\.com:[\s\S]*?oauth_token:\s*(.+)/);
    if (match?.[1]) return match[1].trim();
  } catch {
    // No gh config.
  }
  return null;
}

function snapshotFromQuota(quota: Quota | null, plan?: string, fallbackResetDate?: string): UsageSnapshot {
  if (!quota) return { summary: [{ text: plan || "active", tone: "dim" }] };
  if (quota.unlimited || quota.entitlement === -1) return { summary: [{ text: "unlimited", tone: "success" }] };

  const { entitlement, percentRemaining } = quota;
  let remaining = quota.remaining;
  // Prefer explicit counts; percentages are rounded, mostly from headers.
  if (remaining === undefined && entitlement !== undefined && percentRemaining !== undefined) {
    remaining = entitlement * (percentRemaining / 100);
  }
  const overage = quota.overageCount ?? 0;
  const used = entitlement !== undefined && remaining !== undefined ? Math.max(0, entitlement - remaining) + overage : undefined;
  const usedPercent =
    percentRemaining !== undefined
      ? 100 - percentRemaining
      : used !== undefined && entitlement !== undefined && entitlement > 0
        ? (used / entitlement) * 100
        : undefined;

  if (usedPercent === undefined) return { summary: [{ text: plan || "active", tone: "dim" }] };

  const resetDate = quota.resetDate ?? fallbackResetDate;
  const resetsAt = resetDate ? Date.parse(resetDate) : NaN;
  return {
    primary: {
      icon: ICONS.month,
      usedPercent: Math.max(0, usedPercent),
      resetsAt: Number.isNaN(resetsAt) ? undefined : resetsAt,
      used,
      limit: entitlement,
      tone: overage > 0 ? "error" : undefined,
      note: overage > 0 ? [{ text: `+${formatAmount(overage)} overage`, tone: "warning" }] : undefined,
    },
  };
}

export function snapshotFromUserInfo(info: UserInfo): UsageSnapshot {
  const raw = info.quota_snapshots?.premium_models ?? info.quota_snapshots?.premium_interactions;
  const quota: Quota | null = raw
    ? {
        entitlement: numberValue(raw.entitlement),
        remaining: numberValue(raw.remaining ?? raw.quota_remaining),
        percentRemaining: numberValue(raw.percent_remaining),
        unlimited: raw.unlimited,
        overageCount: numberValue(raw.overage_count),
        resetDate: raw.reset_date,
      }
    : null;
  return snapshotFromQuota(quota, info.copilot_plan, info.quota_reset_date_utc ?? info.quota_reset_date);
}

export function snapshotFromHeaders(headers: Record<string, string>): UsageSnapshot | null {
  const header =
    getHeader(headers, "x-quota-snapshot-premium_models") ??
    getHeader(headers, "x-quota-snapshot-premium_interactions") ??
    getHeader(headers, "x-quota-snapshot-chat");
  if (!header) return null;

  const params = new URLSearchParams(header);
  const entitlement = numberValue(params.get("ent"));
  return snapshotFromQuota({
    entitlement,
    percentRemaining: numberValue(params.get("rem")),
    unlimited: entitlement === -1,
    overageCount: numberValue(params.get("ov")),
    resetDate: params.get("rst") ?? undefined,
  });
}

/** Estimated AI credits of the running prompt, summed from pi's per-turn cost. */
export function createCopilotPromptTracker(): PromptTracker {
  let usd = 0;
  return {
    turnEnd(message) {
      const cost = numberValue((message as any)?.usage?.cost?.total);
      if (cost !== undefined && cost > 0) usd += cost;
    },
    segments() {
      const credits = Math.round((usd / CREDIT_USD) * 10) / 10;
      return [{ text: `~${formatAmount(credits)}cr` }];
    },
  };
}

export const copilotProvider: UsageProvider = {
  id: "github-copilot",
  name: "Copilot",
  cacheTtlMs: 2 * 60 * 1000,
  pollIntervalMs: 2 * 60 * 1000,

  async fetchUsage(auth: AuthSource): Promise<UsageSnapshot> {
    const token = await getGitHubToken(auth);
    if (!token) throw new Error("no token");

    const response = await fetch(USAGE_URL, { headers: { ...COPILOT_HEADERS, Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`usage API returned ${response.status}`);
    return snapshotFromUserInfo((await response.json()) as UserInfo);
  },

  usageFromHeaders(headers) {
    return snapshotFromHeaders(headers);
  },

  createPromptTracker: createCopilotPromptTracker,
};
