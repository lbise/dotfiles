import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { anthropicProvider } from "../providers/anthropic.ts";
import { codexProvider } from "../providers/codex.ts";
import { copilotProvider, createCopilotPromptTracker } from "../providers/copilot.ts";
import { ICONS } from "../format.ts";
import type { AuthSource, Segment } from "../types.ts";

const text = (segments: Segment[] | undefined) => segments?.map((s) => s.text).join("");
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

type Captured = { url?: string; headers?: Record<string, string> };

function stubFetch(body: unknown, status = 200): Captured {
  const captured: Captured = {};
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    captured.url = url;
    captured.headers = init?.headers as Record<string, string>;
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return captured;
}

function auth(keys: Record<string, string>, entries: AuthSource["authEntry"] = async () => undefined): AuthSource {
  return { apiKey: async (p) => keys[p], authEntry: entries };
}

function jwt(payload: object): string {
  return `x.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.y`;
}

// Anthropic

const anthropicPayload = {
  five_hour: { utilization: 42.0, resets_at: "2026-09-25T17:40:00.443674+00:00" },
  seven_day: { utilization: 3.0, resets_at: "2026-09-26T17:00:00+00:00" },
  extra_usage: { is_enabled: false },
};

test("anthropic maps 5h and weekly windows", async () => {
  const captured = stubFetch(anthropicPayload);
  const snapshot = await anthropicProvider.fetchUsage(auth({ anthropic: "sk-ant-oat01-abc" }));

  assert.equal(captured.url, "https://api.anthropic.com/api/oauth/usage");
  assert.equal(captured.headers?.Authorization, "Bearer sk-ant-oat01-abc");
  assert.equal(captured.headers?.["anthropic-beta"], "oauth-2025-04-20");
  assert.deepEqual(snapshot.primary, {
    icon: ICONS.hours,
    usedPercent: 42,
    resetsAt: Date.parse("2026-09-25T17:40:00.443Z"),
  });
  assert.equal(snapshot.secondary?.icon, ICONS.week);
  assert.equal(snapshot.secondary?.usedPercent, 3);
});

test("anthropic flags disabled extra usage", async () => {
  stubFetch(anthropicPayload);
  const snapshot = await anthropicProvider.fetchUsage(auth({ anthropic: "sk-ant-oat01-abc" }));
  assert.equal(text(snapshot.extra), "off");
  assert.equal(snapshot.extra?.[0].tone, "warning");
});

test("anthropic shows enabled extra usage as bar and money", async () => {
  stubFetch({
    ...anthropicPayload,
    extra_usage: { is_enabled: true, utilization: 25, used_credits: 1250, monthly_limit: 5000, currency: "USD", decimal_places: 2 },
  });
  const snapshot = await anthropicProvider.fetchUsage(auth({ anthropic: "sk-ant-oat01-abc" }));
  assert.equal(text(snapshot.extra), "██░░░░░░ 25% $12.5/$50");
});

test("anthropic rejects missing or non-subscription tokens", async () => {
  await assert.rejects(anthropicProvider.fetchUsage(auth({})), /no token/);
  await assert.rejects(anthropicProvider.fetchUsage(auth({ anthropic: "sk-ant-api03-x" })), /not a subscription/);
});

test("anthropic surfaces HTTP errors", async () => {
  stubFetch({}, 401);
  await assert.rejects(anthropicProvider.fetchUsage(auth({ anthropic: "sk-ant-oat01-abc" })), /returned 401/);
});

// Codex

test("codex sends account id from the JWT and maps windows", async () => {
  const captured = stubFetch({
    plan_type: "plus",
    rate_limit: {
      primary_window: { used_percent: 12, limit_window_seconds: 18000, reset_at: 1_800_000_000 },
      secondary_window: { used_percent: 60, limit_window_seconds: 604800, reset_after_seconds: 3600 },
    },
    credits: { has_credits: true, balance: "4.5" },
  });
  const token = jwt({ "https://api.openai.com/auth": { chatgpt_account_id: "acct-1" } });
  const before = Date.now();
  const snapshot = await codexProvider.fetchUsage(auth({ "openai-codex": token }));

  assert.equal(captured.headers?.["chatgpt-account-id"], "acct-1");
  assert.deepEqual(snapshot.primary, { icon: ICONS.hours, usedPercent: 12, resetsAt: 1_800_000_000_000 });
  assert.equal(snapshot.secondary?.icon, ICONS.week);
  assert.ok(snapshot.secondary!.resetsAt! >= before + 3_600_000);
  assert.equal(text(snapshot.extra), "4.5cr");
});

test("codex falls back to auth.json account id", async () => {
  const captured = stubFetch({ rate_limit: null });
  const snapshot = await codexProvider.fetchUsage(
    auth({ "openai-codex": "opaque" }, async () => ({ accountId: "acct-2" }))
  );
  assert.equal(captured.headers?.["chatgpt-account-id"], "acct-2");
  assert.equal(text(snapshot.summary), "active");
});

test("codex headers update windows and keep previous extras", () => {
  const previous = { secondary: { icon: ICONS.week, usedPercent: 5 }, extra: [{ text: "4 credits" }] };
  const snapshot = codexProvider.usageFromHeaders!(
    { "X-Codex-Primary-Used-Percent": "33", "x-codex-primary-window-minutes": "300", "x-codex-primary-reset-at": "100" },
    previous
  );
  assert.deepEqual(snapshot?.primary, { icon: ICONS.hours, usedPercent: 33, resetsAt: 100_000 });
  assert.equal(snapshot?.secondary?.usedPercent, 5);
  assert.equal(text(snapshot?.extra), "4 credits");
  assert.equal(codexProvider.usageFromHeaders!({}, previous), null);
});

// Copilot

test("copilot maps premium quota to a monthly window", async () => {
  const captured = stubFetch({
    copilot_plan: "pro",
    quota_reset_date_utc: "2026-10-01T00:00:00Z",
    quota_snapshots: { premium_interactions: { entitlement: 300, remaining: 240, overage_count: 0 } },
  });
  const snapshot = await copilotProvider.fetchUsage(
    auth({}, async (p) => (p === "github-copilot" ? { refresh: "gho_x" } : undefined))
  );

  assert.equal(captured.headers?.Authorization, "Bearer gho_x");
  assert.equal(snapshot.primary?.icon, ICONS.month);
  assert.equal(snapshot.primary?.usedPercent, 20);
  assert.equal(snapshot.primary?.used, 60);
  assert.equal(snapshot.primary?.limit, 300);
  assert.equal(snapshot.primary?.resetsAt, Date.parse("2026-10-01T00:00:00Z"));
});

test("copilot overage turns the window red with a note", async () => {
  stubFetch({ quota_snapshots: { premium_models: { entitlement: 300, remaining: 0, overage_count: 5 } } });
  const snapshot = await copilotProvider.fetchUsage(auth({}, async () => ({ refresh: "gho_x" })));
  assert.equal(snapshot.primary?.tone, "error");
  assert.equal(snapshot.primary?.used, 305);
  assert.equal(text(snapshot.primary?.note), "+5 overage");
});

test("copilot unlimited plan shows a summary", async () => {
  stubFetch({ quota_snapshots: { premium_models: { entitlement: -1, unlimited: true } } });
  const snapshot = await copilotProvider.fetchUsage(auth({}, async () => ({ refresh: "gho_x" })));
  assert.equal(snapshot.primary, undefined);
  assert.equal(text(snapshot.summary), "unlimited");
});

test("copilot parses quota headers", () => {
  const snapshot = copilotProvider.usageFromHeaders!(
    { "x-quota-snapshot-premium_models": "ent=300&rem=90&ov=0&rst=2026-10-01T00%3A00%3A00Z" },
    null
  );
  assert.equal(snapshot?.primary?.usedPercent, 10);
  assert.equal(snapshot?.primary?.used, 30);
});

test("copilot tracker sums pi's per-turn cost as estimated credits", () => {
  const tracker = createCopilotPromptTracker();
  assert.equal(text(tracker.segments()), "~0cr");
  tracker.turnEnd({ usage: { cost: { total: 0.178 } } });
  assert.equal(text(tracker.segments()), "~17.8cr");
  tracker.turnEnd({ usage: { cost: { total: 0.023 } } });
  tracker.turnEnd({ usage: {} });
  assert.equal(text(tracker.segments()), "~20.1cr");
});

// Azure Foundry

function sessionLine(id: string, at: string, cost: number, tokens: number, provider = "azure-foundry") {
  const message = { role: "assistant", provider, timestamp: Date.parse(at), usage: { totalTokens: tokens, cost: { total: cost } } };
  return JSON.stringify({ type: "message", id, timestamp: at, message });
}

async function azureFixture() {
  const { mkdtemp, mkdir, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "azure-usage-"));
  await mkdir(join(dir, "--a--"));
  await mkdir(join(dir, "--b--"));
  const shared = sessionLine("m1", "2026-10-02T10:00:00Z", 1.5, 1000);
  await writeFile(
    join(dir, "--a--", "one.jsonl"),
    [shared, sessionLine("m2", "2026-09-30T10:00:00Z", 4, 5000), sessionLine("x", "2026-10-03T10:00:00Z", 99, 99, "anthropic"), '{"message":{"provider":"azure-foundry"'].join("\n")
  );
  // A fork copies m1 into a new file and adds one message.
  await writeFile(join(dir, "--b--", "fork.jsonl"), [shared, sessionLine("m3", "2026-10-05T10:00:00Z", 0.5, 500)].join("\n"));
  return dir;
}

test("azure totals sum azure-foundry messages once, split by UTC month", async () => {
  const { totalsFromSessions } = await import("../providers/azure-foundry.ts");
  const totals = await totalsFromSessions(await azureFixture(), Date.parse("2026-10-10T00:00:00Z"));
  assert.deepEqual(totals, { monthCost: 2, monthTokens: 1500, totalCost: 6, totalTokens: 6500 });
});

test("azure totals are empty when there are no sessions", async () => {
  const { totalsFromSessions } = await import("../providers/azure-foundry.ts");
  assert.equal((await totalsFromSessions("/nonexistent/sessions")).totalCost, 0);
});

test("azure snapshot shows a budget bar, or a plain month summary without one", async () => {
  const { snapshotFromTotals } = await import("../providers/azure-foundry.ts");
  const totals = { monthCost: 12.5, monthTokens: 2_500_000, totalCost: 40, totalTokens: 9_000_000 };
  const now = Date.parse("2026-10-10T00:00:00Z");

  const withBudget = snapshotFromTotals(totals, 50, now);
  assert.equal(withBudget.primary?.usedPercent, 25);
  assert.equal(withBudget.primary?.resetsAt, Date.parse("2026-11-01T00:00:00Z"));
  assert.equal(text(withBudget.primary?.note), "$12.50/$50.00");
  assert.equal(text(withBudget.extra), "9.0M tok · $40.00 total");

  const noBudget = snapshotFromTotals(totals, undefined, now);
  assert.equal(noBudget.primary, undefined);
  assert.equal(text(noBudget.summary), `${ICONS.month} $12.50 month`);
});
