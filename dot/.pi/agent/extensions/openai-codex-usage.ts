/**
 * OpenAI Codex Usage Extension for pi
 *
 * Shows ChatGPT/Codex subscription usage in the TUI footer status bar.
 * Codex exposes two rolling windows:
 *   - primary: usually 5 hours
 *   - secondary: usually weekly
 *
 * Token source:
 *   - pi's own auth.json (~/.pi/agent/auth.json, openai-codex OAuth token)
 *
 * Endpoint:
 *   - https://chatgpt.com/backend-api/wham/usage
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

type PiAuthEntry = {
  type?: string;
  access?: string;
  refresh?: string;
  expires?: number;
  accountId?: string;
};

type PiAuthFile = Record<string, PiAuthEntry>;

type CodexWindowRaw = {
  used_percent?: number;
  limit_window_seconds?: number;
  reset_after_seconds?: number;
  reset_at?: number;
};

type CodexRateLimitRaw = {
  allowed?: boolean;
  limit_reached?: boolean;
  primary_window?: CodexWindowRaw | null;
  secondary_window?: CodexWindowRaw | null;
};

type CodexCreditsRaw = {
  has_credits?: boolean;
  unlimited?: boolean;
  balance?: string | number | null;
};

type CodexUsagePayload = {
  plan_type?: string;
  rate_limit?: CodexRateLimitRaw | null;
  credits?: CodexCreditsRaw | null;
  rate_limit_reset_credits?: {
    available_count?: number;
  } | null;
};

type CodexWindow = {
  usedPercent: number;
  windowMinutes?: number;
  resetsAt?: number;
};

type CodexUsageState = {
  source: "endpoint" | "headers";
  planType?: string;
  primary?: CodexWindow;
  secondary?: CodexWindow;
  credits?: CodexCreditsRaw;
  resetCredits?: number;
};

const STATUS_KEY = "openai-codex-usage";
const USAGE_CACHE_TTL_MS = 60 * 1000;
const TOKEN_EXPIRY_SKEW_MS = 60 * 1000;
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const TOKEN_URL = "https://auth.openai.com/oauth/token";
const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const JWT_CLAIM_PATH = "https://api.openai.com/auth";
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function authPath(): string {
  return join(homedir(), ".pi", "agent", "auth.json");
}

async function readPiAuth(): Promise<PiAuthFile | null> {
  try {
    const raw = await readFile(authPath(), "utf8");
    return JSON.parse(raw) as PiAuthFile;
  } catch {
    return null;
  }
}

async function writePiAuth(auth: PiAuthFile): Promise<void> {
  await writeFile(authPath(), `${JSON.stringify(auth, null, 2)}\n`, { mode: 0o600 });
}

function decodeJwtPayload(token: string | undefined): Record<string, any> | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;

  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function accountIdFromAccessToken(access: string | undefined): string | undefined {
  const payload = decodeJwtPayload(access);
  const accountId = payload?.[JWT_CLAIM_PATH]?.chatgpt_account_id;
  return typeof accountId === "string" && accountId.length > 0 ? accountId : undefined;
}

function isUsableAccessToken(entry: PiAuthEntry | undefined): entry is PiAuthEntry & { access: string } {
  if (!entry?.access) return false;
  if (typeof entry.expires !== "number") return true;
  return entry.expires > Date.now() + TOKEN_EXPIRY_SKEW_MS;
}

async function refreshOpenAICodexAuth(auth: PiAuthFile, entry: PiAuthEntry): Promise<PiAuthEntry | null> {
  if (!entry.refresh) return null;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: entry.refresh,
      client_id: CLIENT_ID,
    }),
  });

  if (!response.ok) return null;

  const json = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!json.access_token || typeof json.expires_in !== "number") return null;

  const next: PiAuthEntry = {
    ...entry,
    access: json.access_token,
    refresh: json.refresh_token || entry.refresh,
    expires: Date.now() + json.expires_in * 1000,
    accountId: accountIdFromAccessToken(json.access_token) || entry.accountId,
  };

  auth["openai-codex"] = next;
  await writePiAuth(auth);
  return next;
}

async function getOpenAICodexAuth(forceRefresh = false): Promise<{ access: string; accountId: string } | null> {
  const auth = await readPiAuth();
  const entry = auth?.["openai-codex"];
  if (!auth || !entry) return null;

  const current = !forceRefresh && isUsableAccessToken(entry) ? entry : await refreshOpenAICodexAuth(auth, entry);
  const access = current?.access;
  const accountId = current?.accountId || accountIdFromAccessToken(access);

  if (!access || !accountId) return null;
  return { access, accountId };
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function windowFromRaw(raw: CodexWindowRaw | null | undefined): CodexWindow | undefined {
  const usedPercent = numberValue(raw?.used_percent);
  if (usedPercent === undefined) return undefined;

  const windowSeconds = numberValue(raw?.limit_window_seconds);
  const resetAt = numberValue(raw?.reset_at);
  const resetAfterSeconds = numberValue(raw?.reset_after_seconds);

  return {
    usedPercent,
    windowMinutes: windowSeconds !== undefined && windowSeconds > 0 ? Math.ceil(windowSeconds / 60) : undefined,
    resetsAt:
      resetAt !== undefined
        ? resetAt
        : resetAfterSeconds !== undefined
          ? Math.floor(Date.now() / 1000 + resetAfterSeconds)
          : undefined,
  };
}

function usageStateFromPayload(payload: CodexUsagePayload): CodexUsageState {
  return {
    source: "endpoint",
    planType: payload.plan_type,
    primary: windowFromRaw(payload.rate_limit?.primary_window),
    secondary: windowFromRaw(payload.rate_limit?.secondary_window),
    credits: payload.credits || undefined,
    resetCredits: numberValue(payload.rate_limit_reset_credits?.available_count),
  };
}

function getHeader(headers: Record<string, string>, name: string): string | undefined {
  const direct = headers[name];
  if (direct !== undefined) return direct;

  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) return value;
  }
  return undefined;
}

function windowFromHeaders(headers: Record<string, string>, prefix: string): CodexWindow | undefined {
  const usedPercent = numberValue(getHeader(headers, `${prefix}-used-percent`));
  if (usedPercent === undefined) return undefined;

  return {
    usedPercent,
    windowMinutes: numberValue(getHeader(headers, `${prefix}-window-minutes`)),
    resetsAt: numberValue(getHeader(headers, `${prefix}-reset-at`)),
  };
}

function usageStateFromHeaders(headers: Record<string, string>, previous: CodexUsageState | null): CodexUsageState | null {
  const primary = windowFromHeaders(headers, "x-codex-primary");
  const secondary = windowFromHeaders(headers, "x-codex-secondary");

  if (!primary && !secondary) return null;

  return {
    source: "headers",
    planType: previous?.planType,
    primary: primary || previous?.primary,
    secondary: secondary || previous?.secondary,
    credits: previous?.credits,
    resetCredits: previous?.resetCredits,
  };
}

async function fetchCodexUsage(): Promise<CodexUsageState> {
  let lastStatus: number | undefined;

  for (const forceRefresh of [false, true]) {
    const auth = await getOpenAICodexAuth(forceRefresh);
    if (!auth) throw new Error("no token");

    const response = await fetch(CODEX_USAGE_URL, {
      headers: {
        Authorization: `Bearer ${auth.access}`,
        "chatgpt-account-id": auth.accountId,
        originator: "pi",
        Accept: "application/json",
        "User-Agent": `pi (${process.platform})`,
      },
    });

    lastStatus = response.status;
    if (response.status === 401 && !forceRefresh) continue;

    if (!response.ok) {
      throw new Error(`usage API returned ${response.status}`);
    }

    return usageStateFromPayload((await response.json()) as CodexUsagePayload);
  }

  throw new Error(`usage API returned ${lastStatus || "unknown"}`);
}

function isOpenAICodexModel(model: unknown): boolean {
  return getOpenAICodexModelId(model) !== null;
}

function getOpenAICodexModelId(model: unknown): string | null {
  if (!model || typeof model !== "object") return null;
  const item = model as { provider?: unknown; providerID?: unknown; id?: unknown };

  if (typeof item.id === "string" && item.id.startsWith("openai-codex/")) {
    return item.id.slice("openai-codex/".length);
  }

  if (item.provider === "openai-codex" || item.providerID === "openai-codex") {
    return typeof item.id === "string" ? item.id : "openai-codex";
  }

  return null;
}

function formatAmount(value: number): string {
  if (Number.isInteger(value)) return String(value);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function usageColor(percentUsed: number): "success" | "warning" | "error" {
  if (percentUsed >= 90) return "error";
  if (percentUsed >= 70) return "warning";
  return "success";
}

function formatUsageBar(percentUsed: number, theme: any): string {
  const displayPercent = Math.max(0, percentUsed);
  const clamped = Math.max(0, Math.min(100, displayPercent));
  const width = 10;
  const filled = clamped === 0 ? 0 : Math.max(1, Math.round((clamped / 100) * width));
  const filledWidth = Math.min(width, filled);
  const color = usageColor(displayPercent);

  return (
    theme.fg(color, "█".repeat(filledWidth)) +
    theme.fg("dim", "░".repeat(width - filledWidth)) +
    theme.fg(color, ` ${formatAmount(displayPercent)}%`)
  );
}

function labelForWindow(window: CodexWindow, fallback: string): string {
  const minutes = window.windowMinutes;
  if (!minutes || minutes <= 0) return fallback;

  if (minutes >= 7 * 24 * 60 - 60) return "week";
  if (minutes >= 24 * 60) return `${Math.round(minutes / (24 * 60))}d`;
  if (minutes >= 60) return `${Math.round(minutes / 60)}h`;
  return `${minutes}m`;
}

function formatResetInfo(resetsAt: number | undefined): string | null {
  if (resetsAt === undefined) return null;

  const resetMs = resetsAt * 1000;
  const parsed = new Date(resetMs);
  if (Number.isNaN(parsed.getTime())) return null;

  const remainingMs = Math.max(0, resetMs - Date.now());
  let relative: string;

  if (remainingMs === 0) {
    relative = "Reset now";
  } else if (remainingMs < HOUR_MS) {
    const mins = Math.max(1, Math.ceil(remainingMs / MINUTE_MS));
    relative = `Reset in ${mins}m`;
  } else if (remainingMs < DAY_MS) {
    const hours = Math.floor(remainingMs / HOUR_MS);
    const mins = Math.round((remainingMs % HOUR_MS) / MINUTE_MS);
    relative = `Reset in ${hours}h${mins > 0 ? ` ${mins}m` : ""}`;
  } else {
    const days = Math.ceil(remainingMs / DAY_MS);
    relative = `Reset in ${days} day${days === 1 ? "" : "s"}`;
  }

  const date = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);

  return `${relative} (${date})`;
}

function formatWindowSegment(label: string, window: CodexWindow, theme: any): string {
  const reset = formatResetInfo(window.resetsAt);
  const usage = theme.fg("dim", `${label} `) + formatUsageBar(window.usedPercent, theme);

  return reset ? usage + theme.fg("dim", " · ") + theme.fg("dim", reset) : usage;
}

function formatUsageLine(state: CodexUsageState | null, theme: any): string {
  const separator = theme.fg("dim", " · ");
  const parts: string[] = [];

  if (state?.primary) {
    parts.push(formatWindowSegment(labelForWindow(state.primary, "5h"), state.primary, theme));
  }

  if (state?.secondary) {
    parts.push(formatWindowSegment(labelForWindow(state.secondary, "week"), state.secondary, theme));
  }

  if (state?.credits?.unlimited) {
    parts.push(theme.fg("success", "credits unlimited"));
  } else if (state?.credits?.has_credits && state.credits.balance !== undefined && state.credits.balance !== null) {
    parts.push(theme.fg("dim", `credits ${state.credits.balance}`));
  }

  if (parts.length === 0) {
    parts.push(theme.fg("dim", state?.planType || "active"));
  }

  return theme.fg("dim", "Codex") + separator + parts.join(separator);
}

export default function (pi: ExtensionAPI) {
  let cachedLine: string | null = null;
  let cachedAt = 0;
  let cachedModelId: string | null = null;
  let currentUsage: CodexUsageState | null = null;

  function clearStatus(ctx: { ui: any }) {
    ctx.ui.setStatus(STATUS_KEY, undefined);
  }

  function renderStatus(ctx: { ui: any; model?: unknown }, modelOverride?: unknown) {
    const model = modelOverride ?? ctx.model;
    cachedModelId = getOpenAICodexModelId(model);
    cachedLine = formatUsageLine(currentUsage, ctx.ui.theme);
    cachedAt = Date.now();
    ctx.ui.setStatus(STATUS_KEY, cachedLine);
  }

  async function updateStatus(
    ctx: { ui: any; model?: unknown },
    modelOverride?: unknown,
    options: { force?: boolean } = {}
  ) {
    const model = modelOverride ?? ctx.model;
    const modelId = getOpenAICodexModelId(model);

    if (!modelId) {
      clearStatus(ctx);
      return;
    }

    const now = Date.now();
    if (!options.force && cachedLine && cachedModelId === modelId && now - cachedAt < USAGE_CACHE_TTL_MS) {
      ctx.ui.setStatus(STATUS_KEY, cachedLine);
      return;
    }

    try {
      currentUsage = await fetchCodexUsage();
      renderStatus(ctx, model);
    } catch (err: any) {
      ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("error", `Codex · ${err.message || "fetch failed"}`));
    }
  }

  async function refreshFromCommand(ctx: { ui: any; model?: unknown }) {
    if (!isOpenAICodexModel(ctx.model)) {
      clearStatus(ctx);
      ctx.ui.notify("Codex usage is only shown for OpenAI Codex models", "info");
      return;
    }

    await updateStatus(ctx, undefined, { force: true });
    ctx.ui.notify("Codex usage refreshed", "info");
  }

  pi.registerCommand("codex-usage-refresh", {
    description: "Refresh OpenAI Codex usage display",
    handler: async (_args, ctx) => refreshFromCommand(ctx),
  });

  pi.registerCommand("openai-codex-usage-refresh", {
    description: "Refresh OpenAI Codex usage display",
    handler: async (_args, ctx) => refreshFromCommand(ctx),
  });

  pi.on("session_start", async (_event, ctx) => {
    await updateStatus(ctx);
  });

  pi.on("model_select", async (event, ctx) => {
    await updateStatus(ctx, event.model, { force: true });
  });

  pi.on("agent_start", async (_event, ctx) => {
    if (!isOpenAICodexModel(ctx.model)) {
      clearStatus(ctx);
      return;
    }

    if (currentUsage) {
      renderStatus(ctx);
    } else {
      await updateStatus(ctx);
    }
  });

  pi.on("after_provider_response", async (event, ctx) => {
    if (!isOpenAICodexModel(ctx.model)) return;

    const usage = usageStateFromHeaders(event.headers, currentUsage);
    if (usage) {
      currentUsage = usage;
      renderStatus(ctx);
    }
  });

  pi.on("agent_end", async (_event, ctx) => {
    if (!isOpenAICodexModel(ctx.model)) {
      clearStatus(ctx);
      return;
    }

    await updateStatus(ctx, undefined, { force: true });
  });
}
