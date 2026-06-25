/**
 * Copilot Usage Extension for pi
 *
 * Shows GitHub Copilot premium request usage, quota reset date, and the
 * last prompt's summed Copilot AI credit usage plus USD/CHF estimate in the
 * TUI footer status bar.
 *
 * Token source (in order):
 *   1. pi's own auth.json (~/.pi/agent/auth.json, github-copilot refresh token)
 *   2. GITHUB_TOKEN environment variable
 *   3. GitHub CLI auth (~/.config/gh/hosts.yml)
 *
 * Notes:
 *   - Overall quota is fetched from https://api.github.com/copilot_internal/user.
 *   - Prompt cost is shown from pi's token-based USD cost converted to AI
 *     credits using GitHub's documented 1 AI credit = $0.01 USD rate.
 *   - Per-response and account quota deltas are shown as reconciliation only.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

type PiAuthEntry = {
  type?: string;
  refresh?: string;
  access?: string;
  expires?: number;
};

type PiAuthFile = Record<string, PiAuthEntry>;

type QuotaSnapshot = {
  percent_remaining?: number;
  quota_remaining?: number;
  remaining?: number;
  entitlement?: number | string;
  unlimited?: boolean;
  overage_count?: number;
  overage_permitted?: boolean;
  reset_date?: string;
};

type CopilotUserInfo = {
  copilot_plan?: string;
  quota_reset_date?: string;
  quota_reset_date_utc?: string;
  quota_snapshots?: {
    premium_models?: QuotaSnapshot;
    premium_interactions?: QuotaSnapshot;
    chat?: QuotaSnapshot;
    completions?: QuotaSnapshot;
  };
};

type QuotaState = {
  source: string;
  entitlement?: number;
  remaining?: number;
  percentRemaining?: number;
  unlimited?: boolean;
  overageCount?: number;
  overagePermitted?: boolean;
  resetDate?: string;
  usedUnits?: number;
  totalUsedUnits?: number;
};

type LastPromptUsage = {
  credits: number;
  source: "quota-delta" | "token-estimate";
  quotaDelta?: number;
  quotaPending?: boolean;
};

const USAGE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const STATUS_KEY = "copilot-usage";
const CREDITS_WIDGET_KEY = "copilot-ai-credits";
const DAY_MS = 24 * 60 * 60 * 1000;

// GitHub's usage-based Copilot billing docs define 1 AI credit as $0.01 USD.
// Keep this configurable in case GitHub changes the conversion rate.
const DEFAULT_COPILOT_CREDIT_USD = 0.01;
const DEFAULT_USD_TO_CHF = 0.89;

const COPILOT_HEADERS = {
  Accept: "application/json",
  "Editor-Version": "vscode/1.107.0",
  "Editor-Plugin-Version": "copilot-chat/0.35.0",
  "User-Agent": "GitHubCopilotChat/0.35.0",
  "Copilot-Integration-Id": "vscode-chat",
};

async function readPiAuth(): Promise<PiAuthFile | null> {
  const piAuthPath = join(homedir(), ".pi", "agent", "auth.json");
  try {
    const raw = await readFile(piAuthPath, "utf8");
    return JSON.parse(raw) as PiAuthFile;
  } catch {
    return null;
  }
}

async function getGitHubToken(): Promise<string | null> {
  // 1. pi's own auth.json (github-copilot refresh token is the GitHub OAuth token)
  const auth = await readPiAuth();
  const copilotEntry = auth?.["github-copilot"];
  if (copilotEntry?.refresh) {
    return copilotEntry.refresh;
  }

  // 2. Environment variable
  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN;
  }

  // 3. GitHub CLI hosts.yml (fallback)
  const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  const hostsPath = join(configHome, "gh", "hosts.yml");

  try {
    const raw = await readFile(hostsPath, "utf8");
    const match = raw.match(/github\.com:[\s\S]*?oauth_token:\s*(.+)/);
    if (match?.[1]) {
      return match[1].trim();
    }
  } catch {
    // File not found or unreadable
  }

  return null;
}

async function fetchCopilotUsage(token: string): Promise<CopilotUserInfo> {
  const response = await fetch("https://api.github.com/copilot_internal/user", {
    headers: {
      ...COPILOT_HEADERS,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Copilot API returned ${response.status}`);
  }

  return response.json() as Promise<CopilotUserInfo>;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function buildQuotaState(input: {
  source: string;
  entitlement?: number;
  remaining?: number;
  percentRemaining?: number;
  unlimited?: boolean;
  overageCount?: number;
  overagePermitted?: boolean;
  resetDate?: string;
}): QuotaState {
  const entitlement = input.entitlement;
  const unlimited = input.unlimited || entitlement === -1;
  let remaining = input.remaining;
  let usedUnits: number | undefined;

  if (!unlimited && entitlement !== undefined) {
    // Prefer explicit remaining counts when GitHub provides them. Percentages
    // can be rounded and are mainly useful for response-header snapshots.
    if (remaining !== undefined) {
      usedUnits = Math.max(0, entitlement - remaining);
    } else if (input.percentRemaining !== undefined) {
      remaining = entitlement * (input.percentRemaining / 100);
      usedUnits = Math.max(0, entitlement - remaining);
    }
  }

  const totalUsedUnits = usedUnits === undefined ? undefined : usedUnits + (input.overageCount ?? 0);

  return {
    ...input,
    remaining,
    unlimited,
    usedUnits,
    totalUsedUnits,
  };
}

function quotaStateFromUserInfo(info: CopilotUserInfo): QuotaState | null {
  const premium = info.quota_snapshots?.premium_models ?? info.quota_snapshots?.premium_interactions;
  if (!premium) return null;

  return buildQuotaState({
    source: "user",
    entitlement: numberValue(premium.entitlement),
    remaining: numberValue(premium.remaining ?? premium.quota_remaining),
    percentRemaining: numberValue(premium.percent_remaining),
    unlimited: premium.unlimited,
    overageCount: numberValue(premium.overage_count),
    overagePermitted: premium.overage_permitted,
    resetDate: premium.reset_date ?? info.quota_reset_date_utc ?? info.quota_reset_date,
  });
}

function getHeader(headers: Record<string, string>, names: string[]): string | undefined {
  for (const name of names) {
    const direct = headers[name];
    if (direct !== undefined) return direct;
  }

  const lowerNames = new Set(names.map((name) => name.toLowerCase()));
  for (const [key, value] of Object.entries(headers)) {
    if (lowerNames.has(key.toLowerCase())) return value;
  }

  return undefined;
}

function quotaStateFromHeaders(headers: Record<string, string>): QuotaState | null {
  const header = getHeader(headers, [
    "x-quota-snapshot-premium_models",
    "x-quota-snapshot-premium_interactions",
    "x-quota-snapshot-chat",
  ]);

  if (!header) return null;

  try {
    const params = new URLSearchParams(header);
    const entitlement = numberValue(params.get("ent"));
    const percentRemaining = numberValue(params.get("rem"));

    return buildQuotaState({
      source: "headers",
      entitlement,
      percentRemaining,
      unlimited: entitlement === -1,
      overageCount: numberValue(params.get("ov")),
      overagePermitted: params.get("ovPerm") === "true",
      resetDate: params.get("rst") ?? undefined,
    });
  } catch {
    return null;
  }
}

function usagePercentUsed(quota: QuotaState): number | undefined {
  if (quota.percentRemaining !== undefined) return Math.max(0, 100 - quota.percentRemaining);

  const used = quota.totalUsedUnits ?? quota.usedUnits;
  if (used !== undefined && quota.entitlement !== undefined && quota.entitlement > 0) {
    return Math.max(0, (used / quota.entitlement) * 100);
  }

  return undefined;
}

function usageColor(quota: QuotaState | null, percentUsed: number | undefined): "success" | "warning" | "error" {
  if (quota?.overageCount && quota.overageCount > 0) return "error";
  if (percentUsed !== undefined && percentUsed >= 90) return "error";
  if (percentUsed !== undefined && percentUsed >= 70) return "warning";
  return "success";
}

function formatUsageBar(quota: QuotaState, theme: any): string | null {
  const percentUsed = usagePercentUsed(quota);
  if (percentUsed === undefined || !Number.isFinite(percentUsed)) return null;

  const displayPercent = Math.max(0, percentUsed);
  const clamped = Math.max(0, Math.min(100, displayPercent));
  const width = 10;
  const filled = clamped === 0 ? 0 : Math.max(1, Math.round((clamped / 100) * width));
  const filledWidth = Math.min(width, filled);
  const color = usageColor(quota, displayPercent);

  return (
    theme.fg(color, "█".repeat(filledWidth)) +
    theme.fg("dim", "░".repeat(width - filledWidth)) +
    theme.fg(color, ` ${formatAmount(displayPercent)}%`)
  );
}

function formatUsageLine(
  quota: QuotaState | null,
  theme: any,
  options: { plan?: string; resetDate?: string } = {}
): string {
  const parts: string[] = [];
  const reset = formatResetInfo(quota?.resetDate ?? options.resetDate);

  if (quota?.unlimited) {
    parts.push(theme.fg("success", "unlimited"));
  } else if (quota) {
    const usageBar = formatUsageBar(quota, theme);
    if (usageBar) parts.push(usageBar);

    const used = quota.totalUsedUnits ?? quota.usedUnits;
    if (used !== undefined && quota.entitlement !== undefined) {
      parts.push(theme.fg("dim", `${formatAmount(used)}/${formatAmount(quota.entitlement)} used`));
    }

    if (quota.overageCount && quota.overageCount > 0) {
      parts.push(theme.fg("warning", `+${formatAmount(quota.overageCount)} overage`));
    }
  } else if (options.plan) {
    parts.push(theme.fg("dim", options.plan));
  } else {
    parts.push(theme.fg("dim", "active"));
  }

  if (parts.length === 0) {
    parts.push(theme.fg("dim", options.plan || "active"));
  }

  if (reset) parts.push(theme.fg("dim", reset));

  return theme.fg("dim", "Copilot") + theme.fg("dim", " · ") + parts.join(theme.fg("dim", " · "));
}

function formatCreditsWidgetLine(lastPrompt: LastPromptUsage, theme: any): string {
  const credits = lastPrompt.credits;
  const color = credits >= 10 ? "error" : credits >= 3 ? "warning" : "success";
  const source = lastPrompt.source === "quota-delta" ? "from quota delta" : "token estimate";
  const money = formatCreditCostEstimate(credits);
  const quota =
    lastPrompt.source === "token-estimate"
      ? lastPrompt.quotaDelta !== undefined
        ? `quota delta ${formatAmount(lastPrompt.quotaDelta)}`
        : lastPrompt.quotaPending
          ? "quota delta pending"
          : null
      : null;
  const suffix = [money, source, quota].filter(Boolean).join(" · ");

  return (
    theme.bold(theme.fg(color, `◆ AI credits: ${formatAmount(credits)} ◆`)) +
    (suffix ? theme.fg("dim", ` ${suffix}`) : "")
  );
}

function formatCreditCostEstimate(credits: number): string | null {
  const usdPerCredit = numberValue(process.env.COPILOT_CREDIT_USD) ?? DEFAULT_COPILOT_CREDIT_USD;
  if (!Number.isFinite(usdPerCredit) || usdPerCredit <= 0) return null;

  const usd = credits * usdPerCredit;
  const usdToChf = numberValue(process.env.COPILOT_USD_TO_CHF) ?? DEFAULT_USD_TO_CHF;
  const parts = [`≈${formatCurrency("$", usd)}`];

  if (Number.isFinite(usdToChf) && usdToChf > 0) {
    parts.push(`≈CHF ${formatCurrency("", usd * usdToChf)}`);
  }

  return parts.join(" / ");
}

function formatCurrency(prefix: string, value: number): string {
  if (value > 0 && value < 0.01) return `${prefix}<0.01`;
  return `${prefix}${value.toFixed(2)}`;
}

function formatAmount(value: number): string {
  if (Number.isInteger(value)) return String(value);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function formatResetInfo(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  const date = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(parsed);

  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const resetUtc = Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
  const daysUntil = Math.max(0, Math.round((resetUtc - todayUtc) / DAY_MS));
  const relative = daysUntil === 0 ? "Reset today" : `Reset in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`;

  return `${relative} (${date})`;
}

function isGitHubCopilotModel(model: unknown): boolean {
  return getCopilotModelId(model) !== null;
}

function getCopilotModelId(model: unknown): string | null {
  if (!model || typeof model !== "object") return null;
  const item = model as { provider?: unknown; providerID?: unknown; id?: unknown };

  if (typeof item.id === "string" && item.id.startsWith("github-copilot/")) {
    return item.id.slice("github-copilot/".length);
  }

  if (item.provider === "github-copilot" || item.providerID === "github-copilot") {
    return typeof item.id === "string" ? item.id : null;
  }

  return null;
}

export default function (pi: ExtensionAPI) {
  let cachedLine: string | null = null;
  let cachedAt = 0;
  let cachedModelId: string | null = null;
  let currentQuota: QuotaState | null = null;
  let currentPlan: string | undefined;
  let currentResetDate: string | undefined;
  let lastQuotaTotalUsed: number | null = null;
  let lastPrompt: LastPromptUsage | null = null;
  let activePromptQuotaDeltaCredits = 0;
  let activePromptTokenUsd = 0;
  let activePromptStartTotalUsed: number | null = null;
  let activePromptHasQuotaDelta = false;
  let activePromptHasTokenUsd = false;

  function clearStatus(ctx: { ui: any }) {
    ctx.ui.setStatus(STATUS_KEY, undefined);
    ctx.ui.setWidget(CREDITS_WIDGET_KEY, undefined);
  }

  function clearCreditsWidget(ctx: { ui: any }) {
    ctx.ui.setWidget(CREDITS_WIDGET_KEY, undefined);
  }

  function renderCreditsWidget(ctx: { ui: any }) {
    if (!lastPrompt) {
      clearCreditsWidget(ctx);
      return;
    }
    ctx.ui.setWidget(CREDITS_WIDGET_KEY, [formatCreditsWidgetLine(lastPrompt, ctx.ui.theme)], {
      placement: "belowEditor",
    });
  }

  function renderStatus(ctx: { ui: any; model?: unknown }, modelOverride?: unknown) {
    const model = modelOverride ?? ctx.model;
    const modelId = getCopilotModelId(model);
    cachedModelId = modelId;
    cachedLine = formatUsageLine(currentQuota, ctx.ui.theme, {
      plan: currentPlan,
      resetDate: currentResetDate,
    });
    cachedAt = Date.now();
    ctx.ui.setStatus(STATUS_KEY, cachedLine);
  }

  function applyQuotaStateFromResponse(ctx: { ui: any; model?: unknown }, quota: QuotaState) {
    currentQuota = quota;

    if (quota.totalUsedUnits !== undefined) {
      if (lastQuotaTotalUsed !== null) {
        const delta = quota.totalUsedUnits - lastQuotaTotalUsed;
        // Header percentages are rounded, so ignore tiny/negative noise.
        if (delta > 0.001 && delta < 1000) {
          activePromptQuotaDeltaCredits += delta;
          activePromptHasQuotaDelta = true;
          lastPrompt = { credits: activePromptQuotaDeltaCredits, source: "quota-delta" };
        }
      }
      lastQuotaTotalUsed = quota.totalUsedUnits;
    }

    renderStatus(ctx);
  }

  async function updateStatus(
    ctx: { ui: any; model?: unknown },
    modelOverride?: unknown,
    options: { force?: boolean } = {}
  ): Promise<QuotaState | null> {
    const model = modelOverride ?? ctx.model;
    const modelId = getCopilotModelId(model);

    if (!modelId) {
      clearStatus(ctx);
      return null;
    }

    const now = Date.now();
    if (!options.force && cachedLine && cachedModelId === modelId && now - cachedAt < USAGE_CACHE_TTL_MS) {
      ctx.ui.setStatus(STATUS_KEY, cachedLine);
      return currentQuota;
    }

    const token = await getGitHubToken();
    if (!token) {
      ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("dim", "Copilot · no token"));
      return null;
    }

    try {
      const info = await fetchCopilotUsage(token);
      currentPlan = info.copilot_plan;
      currentResetDate = info.quota_reset_date_utc ?? info.quota_reset_date;
      currentQuota = quotaStateFromUserInfo(info);
      if (currentQuota?.totalUsedUnits !== undefined) {
        lastQuotaTotalUsed = currentQuota.totalUsedUnits;
      }
      renderStatus(ctx, model);
      return currentQuota;
    } catch (err: any) {
      ctx.ui.setStatus(
        STATUS_KEY,
        ctx.ui.theme.fg("error", `Copilot · ${err.message || "fetch failed"}`)
      );
      return null;
    }
  }

  pi.registerCommand("copilot-usage-refresh", {
    description: "Refresh GitHub Copilot usage display",
    handler: async (_args, ctx) => {
      if (!isGitHubCopilotModel(ctx.model)) {
        clearStatus(ctx);
        ctx.ui.notify("Copilot usage is only shown for GitHub Copilot models", "info");
        return;
      }

      await updateStatus(ctx, undefined, { force: true });
      ctx.ui.notify("Copilot usage refreshed", "info");
    },
  });

  // Show usage on session start only if the restored model is GitHub Copilot.
  pi.on("session_start", async (_event, ctx) => {
    await updateStatus(ctx);
  });

  // Show/hide immediately when the user changes models.
  pi.on("model_select", async (event, ctx) => {
    lastPrompt = null;
    clearCreditsWidget(ctx);
    await updateStatus(ctx, event.model, { force: true });
  });

  // Reset per-prompt accounting when the user starts a new prompt.
  pi.on("agent_start", async (_event, ctx) => {
    if (!isGitHubCopilotModel(ctx.model)) {
      clearStatus(ctx);
      return;
    }

    activePromptQuotaDeltaCredits = 0;
    activePromptTokenUsd = 0;
    activePromptStartTotalUsed = null;
    activePromptHasQuotaDelta = false;
    activePromptHasTokenUsd = false;
    lastPrompt = null;
    clearCreditsWidget(ctx);

    // Capture an account-level baseline so agent_end can compute the real
    // prompt delta even when per-response quota headers are absent.
    const startQuota = await updateStatus(ctx, undefined, { force: true });
    activePromptStartTotalUsed = startQuota?.totalUsedUnits ?? null;
  });

  // Copilot sends fresh quota snapshots as response headers. This lets us update
  // the footer immediately and compute per-prompt credit deltas without waiting
  // for a separate /copilot_internal/user request.
  pi.on("after_provider_response", async (event, ctx) => {
    if (!isGitHubCopilotModel(ctx.model)) return;

    const quota = quotaStateFromHeaders(event.headers);
    if (quota) {
      applyQuotaStateFromResponse(ctx, quota);
    } else {
      renderStatus(ctx);
    }
  });

  // Track pi's token-priced USD cost as a fallback. GitHub documents Copilot
  // model prices per 1M tokens and converts USD to credits at $0.01/credit.
  pi.on("turn_end", async (event, ctx) => {
    if (!isGitHubCopilotModel(ctx.model)) return;

    const cost = numberValue((event.message as any)?.usage?.cost?.total);
    if (cost !== undefined && cost >= 0) {
      activePromptTokenUsd += cost;
      activePromptHasTokenUsd = true;
    }
  });

  // Finalize the prompt display. Use token-priced usage as the stable per-prompt
  // value, and show quota deltas only as reconciliation because account-level
  // quota updates can lag or include usage from other clients.
  pi.on("agent_end", async (_event, ctx) => {
    if (!isGitHubCopilotModel(ctx.model)) {
      clearStatus(ctx);
      return;
    }

    const endQuota = await updateStatus(ctx, undefined, { force: true });
    let quotaDelta: number | undefined;
    let quotaPending = false;

    if (activePromptStartTotalUsed !== null && endQuota?.totalUsedUnits !== undefined) {
      const accountDelta = endQuota.totalUsedUnits - activePromptStartTotalUsed;
      if (accountDelta > 0.001 && accountDelta < 10000) {
        quotaDelta = accountDelta;
      } else {
        quotaPending = activePromptHasTokenUsd;
      }
    } else if (activePromptHasQuotaDelta) {
      quotaDelta = activePromptQuotaDeltaCredits;
    } else {
      quotaPending = activePromptHasTokenUsd;
    }

    if (activePromptHasTokenUsd) {
      const usdPerCredit = numberValue(process.env.COPILOT_CREDIT_USD) ?? DEFAULT_COPILOT_CREDIT_USD;
      if (Number.isFinite(usdPerCredit) && usdPerCredit > 0) {
        lastPrompt = {
          credits: activePromptTokenUsd / usdPerCredit,
          source: "token-estimate",
          quotaDelta,
          quotaPending: quotaDelta === undefined && quotaPending,
        };
      }
    } else if (quotaDelta !== undefined) {
      lastPrompt = { credits: quotaDelta, source: "quota-delta" };
    }

    renderCreditsWidget(ctx);
  });
}
