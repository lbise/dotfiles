/**
 * Claude Pro/Max subscription usage.
 *
 * Endpoint: https://api.anthropic.com/api/oauth/usage (undocumented, the one
 * Claude Code's /usage uses). Reports the plan's 5h and weekly windows plus
 * "extra usage", the pay-as-you-go pool. Anthropic bills third-party apps
 * such as pi against extra usage, not the plan windows, so extra usage is
 * what pi actually consumes.
 */

import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { formatAmount, formatBar, formatRemaining, numberValue, windowIcon, windowLabel } from "../format.ts";
import type { AuthSource, Segment, UsageProvider, UsageSnapshot, UsageWindow } from "../types.ts";

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";

/**
 * The endpoint rate limits per account, and every running pi polls it. One file shared by all pi
 * processes holds the last payload and any 429 backoff, so the machine makes at most one request
 * per CACHE_TTL_MS however many sessions are open.
 */
const CACHE_TTL_MS = 2 * 60 * 1000;
/** A lock older than this belongs to a process that died mid-request. */
const LOCK_STALE_MS = 15 * 1000;
const MIN_BACKOFF_MS = 60 * 1000;
const MAX_BACKOFF_MS = 15 * 60 * 1000;

type SharedCache = { fetchedAtMs?: number; payload?: UsagePayload; backoffUntilMs?: number; backoffMs?: number };

function cacheFile(): string {
  return join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "leo", "ai-usage", "pi-anthropic-usage.json");
}

async function readCache(file: string): Promise<SharedCache> {
  try {
    return JSON.parse(await readFile(file, "utf8")) ?? {};
  } catch {
    return {};
  }
}

/** Best effort: a cache that cannot be written only costs extra requests. */
async function writeCache(file: string, cache: SharedCache): Promise<void> {
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify(cache), { mode: 0o600 });
    await rename(tmp, file);
  } catch {
    await rm(tmp, { force: true }).catch(() => undefined);
  }
}

/** true: lock taken. false: another process is fetching. undefined: locking is impossible, fetch anyway. */
async function takeLock(lock: string): Promise<boolean | undefined> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await writeFile(lock, String(process.pid), { flag: "wx", mode: 0o600 });
      return true;
    } catch (err: any) {
      if (err?.code !== "EEXIST") return undefined;
      const age = await stat(lock).then((s) => Date.now() - s.mtimeMs, () => 0);
      if (age < LOCK_STALE_MS) return false;
      await rm(lock, { force: true });
    }
  }
  return false;
}

/** Retry-After in ms, from delay-seconds or an HTTP date. */
export function retryAfterMs(header: string | null, now = Date.now()): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(header);
  return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}

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

function windowFromRaw(raw: WindowRaw | undefined, minutes: number): UsageWindow | undefined {
  const usedPercent = numberValue(raw?.utilization);
  if (usedPercent === undefined) return undefined;
  const resetsAt = raw?.resets_at ? Date.parse(raw.resets_at) : NaN;
  return { icon: windowIcon(minutes, minutes), label: windowLabel(minutes, minutes), usedPercent, resetsAt: Number.isNaN(resetsAt) ? undefined : resetsAt };
}

function formatMoney(minor: number, decimals: number, currency: string | null | undefined): string {
  const amount = formatAmount(minor / 10 ** decimals);
  if (!currency || currency === "USD") return `$${amount}`;
  return `${amount} ${currency}`;
}

function extraSegments(extra: ExtraUsageRaw | undefined): Segment[] | undefined {
  if (!extra) return undefined;
  if (!extra.is_enabled) return [{ text: "off", tone: "warning" }];

  const segments: Segment[] = [];
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
    segments.push({ text: utilization !== undefined ? ` ${text}` : text, tone: "dim" });
  }
  return segments;
}

export function snapshotFromPayload(payload: UsagePayload): UsageSnapshot {
  const primary = windowFromRaw(payload.five_hour, 5 * 60);
  return {
    primary,
    secondary: windowFromRaw(payload.seven_day, 7 * 24 * 60),
    summary: primary ? undefined : [{ text: "active", tone: "dim" }],
    extra: extraSegments(payload.extra_usage),
  };
}

export const anthropicProvider: UsageProvider = {
  id: "anthropic",
  name: "Claude",
  extraLabel: "Extra",
  cacheTtlMs: CACHE_TTL_MS,

  async fetchUsage(auth: AuthSource, options = {}): Promise<UsageSnapshot> {
    const token = await auth.apiKey("anthropic");
    if (!token) throw new Error("no token");
    if (!token.startsWith("sk-ant-oat")) throw new Error("not a subscription login");

    const file = cacheFile();
    const cache = await readCache(file);
    const cached = cache.payload ? snapshotFromPayload(cache.payload) : undefined;
    // Even a manual refresh honours a backoff: Anthropic asked us to wait.
    if (cache.backoffUntilMs && Date.now() < cache.backoffUntilMs) {
      if (cached) return cached;
      throw new Error(`rate limited, retry in ${formatRemaining(cache.backoffUntilMs)}`);
    }
    if (!options.fresh && cached && Date.now() - (cache.fetchedAtMs ?? 0) < CACHE_TTL_MS) return cached;

    await mkdir(join(file, ".."), { recursive: true }).catch(() => undefined);
    const lock = `${file}.lock`;
    const locked = await takeLock(lock);
    if (locked === false && cached) return cached;
    try {
      const response = await fetch(USAGE_URL, {
        headers: {
          Authorization: `Bearer ${token}`,
          "anthropic-beta": "oauth-2025-04-20",
          Accept: "application/json",
        },
      });
      if (response.status === 429) {
        const backoffMs =
          retryAfterMs(response.headers.get("retry-after")) ??
          Math.min(MAX_BACKOFF_MS, Math.max(MIN_BACKOFF_MS, (cache.backoffMs ?? 0) * 2));
        await writeCache(file, { ...cache, backoffUntilMs: Date.now() + backoffMs, backoffMs });
        if (cached) return cached;
      }
      if (!response.ok) throw new Error(`usage API returned ${response.status}`);
      const payload = (await response.json()) as UsagePayload;
      await writeCache(file, { fetchedAtMs: Date.now(), payload });
      return snapshotFromPayload(payload);
    } finally {
      if (locked) await rm(lock, { force: true }).catch(() => undefined);
    }
  },
};
