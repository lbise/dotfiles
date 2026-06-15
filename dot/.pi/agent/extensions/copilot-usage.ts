/**
 * Copilot Usage Extension for pi
 *
 * Shows GitHub Copilot premium request usage, quota reset date, and the
 * last prompt's Copilot credit/rate in the TUI footer status bar.
 *
 * Token source (in order):
 *   1. pi's own auth.json (~/.pi/agent/auth.json, github-copilot refresh token)
 *   2. GITHUB_TOKEN environment variable
 *   3. GitHub CLI auth (~/.config/gh/hosts.yml)
 *
 * Notes:
 *   - Overall quota is fetched from https://api.github.com/copilot_internal/user.
 *   - Per-response quota snapshots are read from Copilot response headers.
 *   - Model premium multipliers are fetched from https://api.githubcopilot.com/models.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
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

type CopilotTokenEnvelope = {
  token?: string;
  expires_at?: number;
  refresh_in?: number;
  endpoints?: {
    api?: string;
  };
};

type CopilotModelMetadata = {
  id?: string;
  name?: string;
  billing?: {
    is_premium?: boolean;
    multiplier?: number;
  };
};

type ModelBillingInfo = {
  id: string;
  name?: string;
  isPremium?: boolean;
  multiplier?: number;
};

type LastPromptUsage = {
  credits: number;
  source: "pi-usage-cost" | "quota-delta" | "model-rate";
};

const USAGE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MODEL_CACHE_TTL_MS = 10 * 60 * 1000; // VS Code refreshes model metadata every ~10 minutes
const TOKEN_EXPIRY_SKEW_MS = 60 * 1000;
const STATUS_KEY = "copilot-usage";
const CREDITS_WIDGET_KEY = "copilot-ai-credits";
const DEFAULT_COPILOT_API_BASE_URL = "https://api.githubcopilot.com";

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

function parseSemicolonToken(token: string | undefined): Record<string, string> {
  if (!token) return {};
  const fields: Record<string, string> = {};
  for (const part of token.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    fields[part.slice(0, idx)] = part.slice(idx + 1);
  }
  return fields;
}

function isUsableCopilotApiToken(token: string | undefined): token is string {
  if (!token) return false;
  const exp = Number(parseSemicolonToken(token).exp);
  if (!Number.isFinite(exp)) return true;
  return exp * 1000 > Date.now() + TOKEN_EXPIRY_SKEW_MS;
}

let cachedCopilotApiToken: string | null = null;
let cachedCopilotApiTokenExpiresAt = 0;
let cachedCopilotApiBaseUrl = DEFAULT_COPILOT_API_BASE_URL;

async function mintCopilotApiToken(githubToken: string): Promise<CopilotTokenEnvelope> {
  const response = await fetch("https://api.github.com/copilot_internal/v2/token", {
    headers: {
      ...COPILOT_HEADERS,
      Authorization: `Bearer ${githubToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Copilot token API returned ${response.status}`);
  }

  return response.json() as Promise<CopilotTokenEnvelope>;
}

async function getCopilotApiToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedCopilotApiToken && cachedCopilotApiTokenExpiresAt > now + TOKEN_EXPIRY_SKEW_MS) {
    return cachedCopilotApiToken;
  }

  const auth = await readPiAuth();
  const storedAccess = auth?.["github-copilot"]?.access;
  if (isUsableCopilotApiToken(storedAccess)) {
    cachedCopilotApiToken = storedAccess;
    const exp = Number(parseSemicolonToken(storedAccess).exp);
    cachedCopilotApiTokenExpiresAt = Number.isFinite(exp) ? exp * 1000 : now + MODEL_CACHE_TTL_MS;
    return storedAccess;
  }

  const githubToken = await getGitHubToken();
  if (!githubToken) return null;

  const envelope = await mintCopilotApiToken(githubToken);
  if (!envelope.token) return null;

  cachedCopilotApiToken = envelope.token;
  cachedCopilotApiTokenExpiresAt = envelope.expires_at
    ? envelope.expires_at * 1000
    : now + Math.max(60, envelope.refresh_in ?? 1500) * 1000;
  cachedCopilotApiBaseUrl = envelope.endpoints?.api || DEFAULT_COPILOT_API_BASE_URL;

  return envelope.token;
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

let cachedModelBilling = new Map<string, ModelBillingInfo>();
let cachedModelBillingAt = 0;

async function fetchCopilotModelBilling(): Promise<Map<string, ModelBillingInfo>> {
  const token = await getCopilotApiToken();
  if (!token) return cachedModelBilling;

  const requestId = randomUUID();
  const response = await fetch(`${cachedCopilotApiBaseUrl.replace(/\/$/, "")}/models`, {
    headers: {
      ...COPILOT_HEADERS,
      Authorization: `Bearer ${token}`,
      "X-Request-Id": requestId,
      "OpenAI-Intent": "model-access",
      "X-GitHub-Api-Version": "2025-10-01",
      "X-Interaction-Type": "model-access",
      "X-Agent-Task-Id": requestId,
    },
  });

  if (!response.ok) {
    throw new Error(`Copilot models API returned ${response.status}`);
  }

  const payload = (await response.json()) as { data?: CopilotModelMetadata[] };
  const next = new Map<string, ModelBillingInfo>();

  for (const model of payload.data ?? []) {
    if (!model.id) continue;
    next.set(model.id, {
      id: model.id,
      name: model.name,
      isPremium: model.billing?.is_premium,
      multiplier: model.billing?.multiplier,
    });
  }

  cachedModelBilling = next;
  cachedModelBillingAt = Date.now();
  return cachedModelBilling;
}

async function getModelBilling(model: unknown): Promise<ModelBillingInfo | null> {
  const id = getCopilotModelId(model);
  if (!id) return null;

  if (Date.now() - cachedModelBillingAt > MODEL_CACHE_TTL_MS) {
    try {
      await fetchCopilotModelBilling();
    } catch {
      // Keep stale model metadata if refresh fails.
    }
  }

  return cachedModelBilling.get(id) ?? { id };
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
    if (input.percentRemaining !== undefined) {
      remaining = entitlement * (input.percentRemaining / 100);
      usedUnits = Math.max(0, entitlement - remaining);
    } else if (remaining !== undefined) {
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

function formatUsageLine(
  quota: QuotaState | null,
  theme: any,
  options: { plan?: string } = {}
): string {
  const parts: string[] = [];

  if (quota?.unlimited) {
    const reset = formatResetDate(quota.resetDate);
    parts.push(theme.fg("success", "unlimited"));
    if (reset) parts.push(theme.fg("dim", `resets ${reset}`));
  } else if (quota) {
    if (quota.percentRemaining !== undefined) {
      const percentUsed = Math.max(0, 100 - quota.percentRemaining);
      const color = percentUsed >= 90 ? "error" : percentUsed >= 70 ? "warning" : "success";
      parts.push(theme.fg(color, `${formatAmount(percentUsed)}% used`));
    }

    const used = quota.totalUsedUnits ?? quota.usedUnits;
    if (used !== undefined && quota.entitlement !== undefined) {
      parts.push(theme.fg("dim", `(${formatAmount(used)}/${formatAmount(quota.entitlement)})`));
    }

    if (quota.overageCount && quota.overageCount > 0) {
      parts.push(theme.fg("warning", `+${formatAmount(quota.overageCount)} overage`));
    }

    const reset = formatResetDate(quota.resetDate);
    if (reset) parts.push(theme.fg("dim", `resets ${reset}`));
  } else if (options.plan) {
    parts.push(theme.fg("dim", options.plan));
  } else {
    parts.push(theme.fg("dim", "active"));
  }

  return theme.fg("dim", "Copilot: ") + parts.join(theme.fg("dim", " · "));
}

function formatCreditsWidgetLine(lastPrompt: LastPromptUsage, theme: any): string {
  const credits = lastPrompt.credits;
  const color = credits >= 10 ? "error" : credits >= 3 ? "warning" : "success";
  const source =
    lastPrompt.source === "pi-usage-cost"
      ? ""
      : lastPrompt.source === "quota-delta"
        ? " quota delta"
        : " rate fallback";
  return theme.bold(theme.fg(color, `◆ AI credits: ${formatAmount(credits)} ◆`)) + theme.fg("dim", source);
}

function formatAmount(value: number): string {
  if (Number.isInteger(value)) return String(value);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function formatResetDate(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(parsed);
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
  let lastQuotaTotalUsed: number | null = null;
  let lastBilling: ModelBillingInfo | null = null;
  let lastPrompt: LastPromptUsage | null = null;
  let activePromptQuotaDeltaCredits = 0;
  let activePromptUsageCostCredits = 0;
  let activePromptHasQuotaDelta = false;
  let activePromptHasUsageCost = false;
  let activePromptSawQuotaHeader = false;

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
    });
    cachedAt = Date.now();
    ctx.ui.setStatus(STATUS_KEY, cachedLine);
  }

  function applyQuotaStateFromResponse(ctx: { ui: any; model?: unknown }, quota: QuotaState) {
    currentQuota = quota;
    activePromptSawQuotaHeader = true;

    if (quota.totalUsedUnits !== undefined) {
      if (lastQuotaTotalUsed !== null) {
        const delta = quota.totalUsedUnits - lastQuotaTotalUsed;
        // Header percentages are rounded, so ignore tiny/negative noise.
        if (delta > 0.001 && delta < 1000) {
          activePromptQuotaDeltaCredits += delta;
          activePromptHasQuotaDelta = true;
          if (!activePromptHasUsageCost) {
            lastPrompt = { credits: activePromptQuotaDeltaCredits, source: "quota-delta" };
          }
        }
      }
      lastQuotaTotalUsed = quota.totalUsedUnits;
    }

    renderStatus(ctx);
  }

  async function updateBilling(ctx: { ui: any; model?: unknown }, modelOverride?: unknown) {
    const billing = await getModelBilling(modelOverride ?? ctx.model);
    if (billing) {
      lastBilling = billing;
    }
  }

  async function updateStatus(
    ctx: { ui: any; model?: unknown },
    modelOverride?: unknown,
    options: { force?: boolean } = {}
  ) {
    const model = modelOverride ?? ctx.model;
    const modelId = getCopilotModelId(model);

    if (!modelId) {
      clearStatus(ctx);
      return;
    }

    const now = Date.now();
    if (!options.force && cachedLine && cachedModelId === modelId && now - cachedAt < USAGE_CACHE_TTL_MS) {
      ctx.ui.setStatus(STATUS_KEY, cachedLine);
      return;
    }

    await updateBilling(ctx, model);

    const token = await getGitHubToken();
    if (!token) {
      ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("dim", "Copilot: no token"));
      return;
    }

    try {
      const info = await fetchCopilotUsage(token);
      currentPlan = info.copilot_plan;
      currentQuota = quotaStateFromUserInfo(info);
      if (currentQuota?.totalUsedUnits !== undefined) {
        lastQuotaTotalUsed = currentQuota.totalUsedUnits;
      }
      renderStatus(ctx, model);
    } catch (err: any) {
      ctx.ui.setStatus(
        STATUS_KEY,
        ctx.ui.theme.fg("error", `Copilot: ${err.message || "fetch failed"}`)
      );
    }
  }

  // Show usage on session start only if the restored model is GitHub Copilot.
  pi.on("session_start", async (_event, ctx) => {
    await updateStatus(ctx);
  });

  // Show/hide immediately when the user changes models.
  pi.on("model_select", async (event, ctx) => {
    lastPrompt = null;
    lastBilling = null;
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
    activePromptUsageCostCredits = 0;
    activePromptHasQuotaDelta = false;
    activePromptHasUsageCost = false;
    activePromptSawQuotaHeader = false;
    lastPrompt = null;
    clearCreditsWidget(ctx);

    if (currentQuota || currentPlan) {
      await updateBilling(ctx);
      renderStatus(ctx);
    } else {
      await updateStatus(ctx);
    }
  });

  // Copilot sends fresh quota snapshots as response headers. This lets us update
  // the footer immediately and compute per-prompt credit deltas without waiting
  // for a separate /copilot_internal/user request.
  pi.on("after_provider_response", async (event, ctx) => {
    if (!isGitHubCopilotModel(ctx.model)) return;

    await updateBilling(ctx);

    const quota = quotaStateFromHeaders(event.headers);
    if (quota) {
      applyQuotaStateFromResponse(ctx, quota);
    } else {
      renderStatus(ctx);
    }
  });

  // Prefer pi's token-based usage cost when available. For Copilot models this
  // uses the model credit rates and gives decimal values similar to VS Code.
  pi.on("turn_end", async (event, ctx) => {
    if (!isGitHubCopilotModel(ctx.model)) return;

    const cost = numberValue((event.message as any)?.usage?.cost?.total);
    if (cost !== undefined && cost >= 0) {
      activePromptUsageCostCredits += cost;
      activePromptHasUsageCost = true;
      lastPrompt = { credits: activePromptUsageCostCredits, source: "pi-usage-cost" };
      renderStatus(ctx);
    }
  });

  // Finalize the prompt display. If usage cost and quota deltas are unavailable,
  // fall back to VS Code-style model rate/multiplier metadata.
  pi.on("agent_end", async (_event, ctx) => {
    if (!isGitHubCopilotModel(ctx.model)) {
      clearStatus(ctx);
      return;
    }

    if (!activePromptHasUsageCost && !activePromptHasQuotaDelta && lastBilling?.multiplier !== undefined) {
      lastPrompt = { credits: lastBilling.multiplier, source: "model-rate" };
    }

    renderCreditsWidget(ctx);

    // If headers gave us current quota for this prompt, avoid an extra API call.
    // Otherwise force a user-info refresh so the overall usage does not remain stale.
    if (activePromptSawQuotaHeader) {
      renderStatus(ctx);
    } else {
      await updateStatus(ctx, undefined, { force: true });
    }
  });
}
