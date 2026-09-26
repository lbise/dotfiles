import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { anthropicProvider } from "../providers/anthropic.ts";
import { codexProvider } from "../providers/codex.ts";
import { copilotProvider, createCopilotPromptTracker } from "../providers/copilot.ts";
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
    label: "5h",
    usedPercent: 42,
    resetsAt: Date.parse("2026-09-25T17:40:00.443Z"),
  });
  assert.equal(snapshot.secondary?.label, "week");
  assert.equal(snapshot.secondary?.usedPercent, 3);
});

test("anthropic flags disabled extra usage", async () => {
  stubFetch(anthropicPayload);
  const snapshot = await anthropicProvider.fetchUsage(auth({ anthropic: "sk-ant-oat01-abc" }));
  assert.equal(text(snapshot.extra), "extra off");
  assert.equal(snapshot.extra?.[0].tone, "warning");
});

test("anthropic shows enabled extra usage as bar and money", async () => {
  stubFetch({
    ...anthropicPayload,
    extra_usage: { is_enabled: true, utilization: 25, used_credits: 1250, monthly_limit: 5000, currency: "USD", decimal_places: 2 },
  });
  const snapshot = await anthropicProvider.fetchUsage(auth({ anthropic: "sk-ant-oat01-abc" }));
  assert.equal(text(snapshot.extra), "extra ██░░░░░░ 25% ($12.5/$50)");
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
  assert.deepEqual(snapshot.primary, { label: "5h", usedPercent: 12, resetsAt: 1_800_000_000_000 });
  assert.equal(snapshot.secondary?.label, "week");
  assert.ok(snapshot.secondary!.resetsAt! >= before + 3_600_000);
  assert.equal(text(snapshot.extra), "4.5 credits");
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
  const previous = { secondary: { label: "week", usedPercent: 5 }, extra: [{ text: "4 credits" }] };
  const snapshot = codexProvider.usageFromHeaders!(
    { "X-Codex-Primary-Used-Percent": "33", "x-codex-primary-window-minutes": "300", "x-codex-primary-reset-at": "100" },
    previous
  );
  assert.deepEqual(snapshot?.primary, { label: "5h", usedPercent: 33, resetsAt: 100_000 });
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
  assert.equal(snapshot.primary?.label, "month");
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

test("copilot tracker prefers token cost and shows quota reconciliation", () => {
  const tracker = createCopilotPromptTracker();
  tracker.start({ primary: { label: "month", usedPercent: 10, used: 30 } });
  tracker.turnEnd({ usage: { cost: { total: 0.02 } } });
  tracker.turnEnd({ usage: { cost: { total: 0.01 } } });
  const out = text(tracker.end({ primary: { label: "month", usedPercent: 11, used: 33 } }));
  assert.match(out!, /^💸 3 credits \(~0\.03CHF\) · 33-30 = 3 AI credits$/);
});

test("copilot tracker falls back to quota delta, then nothing", () => {
  const withDelta = createCopilotPromptTracker();
  withDelta.start({ primary: { label: "month", usedPercent: 10, used: 30 } });
  assert.match(text(withDelta.end({ primary: { label: "month", usedPercent: 10, used: 31 } }))!, /^💸 1 credits/);

  const empty = createCopilotPromptTracker();
  empty.start(null);
  assert.equal(empty.end(null), undefined);
});
