/**
 * Azure Foundry usage, summed from pi's own session files.
 *
 * Foundry offers no usage API for an API key, and the resource is shared, so
 * this counts only what this machine's pi sent: every assistant message of the
 * "azure-foundry" provider in ~/.pi/agent/sessions, priced by pi's catalog
 * (an estimate, not the Azure bill). Calendar months are UTC, like Azure's.
 *
 * Optional budget: set AZURE_FOUNDRY_BUDGET_USD to show the month as a bar.
 *
 * Forked sessions copy earlier messages into a new file, so messages are
 * de-duplicated by entry id + timestamp. Parsed files are cached by mtime and
 * size, so a refresh only re-reads the session that changed.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { ICONS, numberValue } from "../format.ts";
import type { AuthSource, Segment, UsageProvider, UsageSnapshot } from "../types.ts";

const PROVIDER_ID = "azure-foundry";

type Entry = { key: string; at: number; tokens: number; cost: number };
type CachedFile = { mtimeMs: number; size: number; entries: Entry[] };

const fileCache = new Map<string, CachedFile>();

async function sessionFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  for (const project of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (!project.isDirectory()) continue;
    for (const file of await readdir(join(dir, project.name)).catch(() => [] as string[])) {
      if (file.endsWith(".jsonl")) files.push(join(dir, project.name, file));
    }
  }
  return files;
}

function parseEntries(content: string): Entry[] {
  const entries: Entry[] = [];
  for (const line of content.split("\n")) {
    if (!line.includes(`"provider":"${PROVIDER_ID}"`)) continue;
    try {
      const entry = JSON.parse(line);
      const message = entry.message;
      if (message?.role !== "assistant" || message.provider !== PROVIDER_ID) continue;
      const at = numberValue(message.timestamp) ?? Date.parse(entry.timestamp);
      if (Number.isNaN(at)) continue;
      entries.push({
        key: `${entry.id}|${at}`,
        at,
        tokens: numberValue(message.usage?.totalTokens) ?? 0,
        cost: numberValue(message.usage?.cost?.total) ?? 0,
      });
    } catch {
      // A partially written last line.
    }
  }
  return entries;
}

async function entriesOf(file: string): Promise<Entry[]> {
  const info = await stat(file);
  const cached = fileCache.get(file);
  if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) return cached.entries;
  const entries = parseEntries(await readFile(file, "utf8"));
  fileCache.set(file, { mtimeMs: info.mtimeMs, size: info.size, entries });
  return entries;
}

export type AzureTotals = { monthCost: number; monthTokens: number; totalCost: number; totalTokens: number };

export async function totalsFromSessions(dir: string, now = Date.now()): Promise<AzureTotals> {
  const monthStart = monthStartUtc(now);
  const seen = new Set<string>();
  const totals: AzureTotals = { monthCost: 0, monthTokens: 0, totalCost: 0, totalTokens: 0 };
  for (const file of await sessionFiles(dir)) {
    for (const entry of await entriesOf(file).catch(() => [] as Entry[])) {
      if (seen.has(entry.key)) continue;
      seen.add(entry.key);
      totals.totalCost += entry.cost;
      totals.totalTokens += entry.tokens;
      if (entry.at >= monthStart) {
        totals.monthCost += entry.cost;
        totals.monthTokens += entry.tokens;
      }
    }
  }
  return totals;
}

function monthStartUtc(now: number, offset = 0): number {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1);
}

const usd = (value: number) => `$${value.toFixed(2)}`;

function formatTokens(value: number): string {
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return String(Math.round(value));
}

export function snapshotFromTotals(totals: AzureTotals, budget: number | undefined, now = Date.now()): UsageSnapshot {
  const extra: Segment[] = [{ text: `${formatTokens(totals.totalTokens)} tok · ${usd(totals.totalCost)} total` }];
  if (budget === undefined) {
    return { summary: [{ text: `${ICONS.month} ${usd(totals.monthCost)} month`, tone: "success" }], extra };
  }
  return {
    primary: {
      icon: ICONS.month,
      usedPercent: (totals.monthCost / budget) * 100,
      resetsAt: monthStartUtc(now, 1),
      note: [{ text: `${usd(totals.monthCost)}/${usd(budget)}`, tone: "dim" }],
    },
    extra,
  };
}

export const azureFoundryProvider: UsageProvider = {
  id: PROVIDER_ID,
  name: "Azure Foundry",
  // Local files only, so a short TTL is cheap and keeps the footer current after each turn.
  cacheTtlMs: 10 * 1000,

  async fetchUsage(_auth: AuthSource): Promise<UsageSnapshot> {
    const budget = numberValue(process.env.AZURE_FOUNDRY_BUDGET_USD);
    const totals = await totalsFromSessions(join(homedir(), ".pi", "agent", "sessions"));
    return snapshotFromTotals(totals, budget && budget > 0 ? budget : undefined);
  },
};
