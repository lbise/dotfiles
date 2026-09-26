/**
 * ChatGPT/Codex subscription usage.
 *
 * Endpoint: https://chatgpt.com/backend-api/wham/usage (undocumented).
 * Codex also sends x-codex-{primary,secondary}-* headers on every response.
 */

import { getHeader, numberValue, windowLabel } from "../format.ts";
import type { AuthSource, Segment, UsageProvider, UsageSnapshot, UsageWindow } from "../types.ts";

const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const JWT_CLAIM_PATH = "https://api.openai.com/auth";

type WindowRaw = {
  used_percent?: number;
  limit_window_seconds?: number;
  reset_after_seconds?: number;
  reset_at?: number;
};

type CreditsRaw = {
  has_credits?: boolean;
  unlimited?: boolean;
  balance?: string | number | null;
};

type UsagePayload = {
  plan_type?: string;
  rate_limit?: { primary_window?: WindowRaw | null; secondary_window?: WindowRaw | null } | null;
  credits?: CreditsRaw | null;
};

function accountIdFromJwt(token: string): string | undefined {
  const part = token.split(".")[1];
  if (!part) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    const id = payload?.[JWT_CLAIM_PATH]?.chatgpt_account_id;
    return typeof id === "string" && id.length > 0 ? id : undefined;
  } catch {
    return undefined;
  }
}

function windowFromRaw(raw: WindowRaw | null | undefined, fallbackLabel: string, now: number): UsageWindow | undefined {
  const usedPercent = numberValue(raw?.used_percent);
  if (usedPercent === undefined) return undefined;

  const seconds = numberValue(raw?.limit_window_seconds);
  const resetAt = numberValue(raw?.reset_at);
  const resetAfter = numberValue(raw?.reset_after_seconds);

  return {
    label: windowLabel(seconds !== undefined && seconds > 0 ? Math.ceil(seconds / 60) : undefined, fallbackLabel),
    usedPercent,
    resetsAt: resetAt !== undefined ? resetAt * 1000 : resetAfter !== undefined ? now + resetAfter * 1000 : undefined,
  };
}

function creditsSegments(credits: CreditsRaw | null | undefined): Segment[] | undefined {
  if (credits?.unlimited) return [{ text: "unlimited", tone: "success" }];
  if (credits?.has_credits && credits.balance !== undefined && credits.balance !== null) {
    return [{ text: `${credits.balance} credits`, tone: "dim" }];
  }
  return undefined;
}

export function snapshotFromPayload(payload: UsagePayload, now = Date.now()): UsageSnapshot {
  const primary = windowFromRaw(payload.rate_limit?.primary_window, "5h", now);
  return {
    primary,
    secondary: windowFromRaw(payload.rate_limit?.secondary_window, "week", now),
    summary: primary ? undefined : [{ text: payload.plan_type || "active", tone: "dim" }],
    extra: creditsSegments(payload.credits),
  };
}

function windowFromHeaders(headers: Record<string, string>, prefix: string, fallbackLabel: string): UsageWindow | undefined {
  const usedPercent = numberValue(getHeader(headers, `${prefix}-used-percent`));
  if (usedPercent === undefined) return undefined;
  const resetAt = numberValue(getHeader(headers, `${prefix}-reset-at`));
  return {
    label: windowLabel(numberValue(getHeader(headers, `${prefix}-window-minutes`)), fallbackLabel),
    usedPercent,
    resetsAt: resetAt !== undefined ? resetAt * 1000 : undefined,
  };
}

export const codexProvider: UsageProvider = {
  id: "openai-codex",
  name: "Codex",
  cacheTtlMs: 60 * 1000,

  async fetchUsage(auth: AuthSource): Promise<UsageSnapshot> {
    const access = await auth.apiKey("openai-codex");
    if (!access) throw new Error("no token");
    const accountId = accountIdFromJwt(access) ?? (await auth.authEntry("openai-codex"))?.accountId;
    if (!accountId) throw new Error("no account id");

    const response = await fetch(USAGE_URL, {
      headers: {
        Authorization: `Bearer ${access}`,
        "chatgpt-account-id": accountId,
        originator: "pi",
        Accept: "application/json",
        "User-Agent": `pi (${process.platform})`,
      },
    });
    if (!response.ok) throw new Error(`usage API returned ${response.status}`);
    return snapshotFromPayload((await response.json()) as UsagePayload);
  },

  usageFromHeaders(headers, previous) {
    const primary = windowFromHeaders(headers, "x-codex-primary", "5h");
    const secondary = windowFromHeaders(headers, "x-codex-secondary", "week");
    if (!primary && !secondary) return null;
    return {
      ...previous,
      primary: primary ?? previous?.primary,
      secondary: secondary ?? previous?.secondary,
      summary: undefined,
    };
  },
};
