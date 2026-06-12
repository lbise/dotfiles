/**
 * Copilot Usage Extension for pi
 *
 * Shows GitHub Copilot premium request usage (% used) and quota reset date
 * in the TUI footer status bar.
 *
 * Token source (in order):
 *   1. pi's own auth.json (~/.pi/agent/auth.json, github-copilot refresh token)
 *   2. GITHUB_TOKEN environment variable
 *   3. GitHub CLI auth (~/.config/gh/hosts.yml)
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
  entitlement?: number;
  unlimited?: boolean;
};

type CopilotUserInfo = {
  copilot_plan?: string;
  quota_reset_date_utc?: string;
  quota_snapshots?: {
    premium_interactions?: QuotaSnapshot;
    chat?: QuotaSnapshot;
    completions?: QuotaSnapshot;
  };
};

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const STATUS_KEY = "copilot-usage";

async function getGitHubToken(): Promise<string | null> {
  // 1. pi's own auth.json (github-copilot refresh token is the GitHub OAuth token)
  const piAuthPath = join(homedir(), ".pi", "agent", "auth.json");
  try {
    const raw = await readFile(piAuthPath, "utf8");
    const auth = JSON.parse(raw) as PiAuthFile;
    const copilotEntry = auth["github-copilot"];
    if (copilotEntry?.refresh) {
      return copilotEntry.refresh;
    }
  } catch {
    // File not found or unreadable
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
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Editor-Version": "vscode/1.105.0",
      "Editor-Plugin-Version": "copilot-chat/0.32.4",
      "User-Agent": "GitHubCopilotChat/0.35.0",
      "Copilot-Integration-Id": "vscode-chat",
    },
  });

  if (!response.ok) {
    throw new Error(`Copilot API returned ${response.status}`);
  }

  return response.json() as Promise<CopilotUserInfo>;
}

function formatUsageLine(info: CopilotUserInfo, theme: any): string {
  const premium = info.quota_snapshots?.premium_interactions;

  if (premium?.unlimited) {
    const reset = formatResetDate(info.quota_reset_date_utc);
    return theme.fg("dim", `Copilot: unlimited${reset ? ` · resets ${reset}` : ""}`);
  }

  const percentUsed =
    typeof premium?.percent_remaining === "number"
      ? (100 - premium.percent_remaining).toFixed(1)
      : null;

  const remaining = premium?.remaining ?? premium?.quota_remaining;
  const entitlement = premium?.entitlement;

  const reset = formatResetDate(info.quota_reset_date_utc);

  const parts: string[] = [];

  if (percentUsed !== null) {
    const pct = parseFloat(percentUsed);
    const color = pct >= 90 ? "error" : pct >= 70 ? "warning" : "success";
    parts.push(theme.fg(color, `${percentUsed}% used`));
  }

  if (typeof remaining === "number" && typeof entitlement === "number") {
    parts.push(theme.fg("dim", `(${remaining}/${entitlement})`));
  }

  if (reset) {
    parts.push(theme.fg("dim", `resets ${reset}`));
  }

  if (parts.length === 0) {
    return theme.fg("dim", `Copilot: ${info.copilot_plan || "active"}`);
  }

  return theme.fg("dim", "Copilot: ") + parts.join(theme.fg("dim", " · "));
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
  if (!model || typeof model !== "object") return false;
  const item = model as { provider?: unknown; providerID?: unknown; id?: unknown };
  return (
    item.provider === "github-copilot" ||
    item.providerID === "github-copilot" ||
    (typeof item.id === "string" && item.id.startsWith("github-copilot/"))
  );
}

export default function (pi: ExtensionAPI) {
  let cachedLine: string | null = null;
  let cachedAt = 0;

  async function updateStatus(ctx: { ui: any; model?: unknown }, modelOverride?: unknown) {
    if (!isGitHubCopilotModel(modelOverride ?? ctx.model)) {
      ctx.ui.setStatus(STATUS_KEY, undefined);
      return;
    }

    const now = Date.now();
    if (cachedLine && now - cachedAt < CACHE_TTL_MS) {
      ctx.ui.setStatus(STATUS_KEY, cachedLine);
      return;
    }

    const token = await getGitHubToken();
    if (!token) {
      ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("dim", "Copilot: no token"));
      return;
    }

    try {
      const info = await fetchCopilotUsage(token);
      cachedLine = formatUsageLine(info, ctx.ui.theme);
      cachedAt = now;
      ctx.ui.setStatus(STATUS_KEY, cachedLine);
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
    await updateStatus(ctx, event.model);
  });

  // Refresh after each agent turn completes, but only for GitHub Copilot models.
  pi.on("agent_end", async (_event, ctx) => {
    cachedAt = 0;
    await updateStatus(ctx);
  });
}
