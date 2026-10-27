import assert from "node:assert/strict";
import test, { afterEach, mock } from "node:test";

import { ICONS } from "../format.ts";
import extension, { STATUS_KEYS, providerForModel } from "../index.ts";

const realFetch = globalThis.fetch;
const realEnv = { HOME: process.env.HOME, GITHUB_TOKEN: process.env.GITHUB_TOKEN };
afterEach(() => {
  globalThis.fetch = realFetch;
  mock.timers.reset();
  for (const [key, value] of Object.entries(realEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

/** Lets unawaited refreshes started by handlers or timers settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

type Handler = (event: any, ctx: any) => Promise<void>;

function setup(fetchBody: unknown) {
  const handlers = new Map<string, Handler>();
  const commands = new Map<string, { handler: (args: string, ctx: any) => Promise<void> }>();
  const statuses = new Map<string, string>();
  const notifications: string[] = [];
  let fetches = 0;

  globalThis.fetch = (async () => {
    fetches++;
    return new Response(JSON.stringify(fetchBody));
  }) as typeof fetch;

  extension({
    on: (name: string, handler: Handler) => handlers.set(name, handler),
    registerCommand: (name: string, command: any) => commands.set(name, command),
  } as any);

  const ctx = {
    model: { provider: "anthropic", id: "claude-opus-4-5" } as unknown,
    modelRegistry: { getApiKeyForProvider: async () => "sk-ant-oat01-abc" },
    ui: {
      theme: { fg: (_c: string, t: string) => t, bold: (t: string) => t },
      setStatus: (key: string, value: string | undefined) =>
        value === undefined ? statuses.delete(key) : statuses.set(key, value),
      notify: (message: string) => notifications.push(message),
    },
  };

  return {
    ctx,
    statuses,
    notifications,
    fetches: () => fetches,
    emit: (name: string, event: any = {}) => handlers.get(name)!(event, ctx),
    command: (name: string) => commands.get(name)!.handler("", ctx),
  };
}

const payload = {
  five_hour: { utilization: 42, resets_at: new Date(Date.now() + 3_600_000).toISOString() },
  seven_day: { utilization: 3, resets_at: new Date(Date.now() + 3 * 86_400_000).toISOString() },
  extra_usage: { is_enabled: false },
};

test("matches providers by provider field or prefixed id", () => {
  assert.equal(providerForModel({ provider: "anthropic", id: "x" })?.name, "Claude");
  assert.equal(providerForModel({ id: "openai-codex/gpt-5" })?.name, "Codex");
  assert.equal(providerForModel({ provider: "openai", id: "gpt-5" }), undefined);
});

test("session start publishes every generic status key", async () => {
  const h = setup(payload);
  h.statuses.set("copilot-usage", "stale");
  await h.emit("session_start");

  assert.equal(h.statuses.get(STATUS_KEYS.primary), `${ICONS.hours} ███░░░░░ 42%`);
  assert.match(h.statuses.get(STATUS_KEYS.primaryReset)!, new RegExp(`^${ICONS.reset} (60m|1h) \\d\\d:\\d\\d$`));
  assert.equal(h.statuses.get(STATUS_KEYS.secondary), `${ICONS.week} █░░░░░░░ 3%`);
  assert.match(h.statuses.get(STATUS_KEYS.secondaryReset)!, new RegExp(`^${ICONS.reset} 3d \\d\\d\\.\\d\\d$`));
  assert.equal(h.statuses.get(STATUS_KEYS.extra), `${ICONS.money} off`);
  assert.equal(h.statuses.has("copilot-usage"), false);
});

test("cached usage is reused within the TTL and refreshed on agent end", async () => {
  const h = setup(payload);
  await h.emit("session_start");
  await h.emit("agent_start");
  assert.equal(h.fetches(), 1);
  await h.emit("agent_end");
  assert.equal(h.fetches(), 2);
});

test("switching to an untracked model clears the statuses", async () => {
  const h = setup(payload);
  await h.emit("session_start");
  await h.emit("model_select", { model: { provider: "openai", id: "gpt-5" } });
  assert.equal(h.statuses.size, 0);
});

test("fetch errors show in the primary status", async () => {
  const h = setup(payload);
  h.ctx.modelRegistry.getApiKeyForProvider = async () => "sk-ant-api03-x";
  await h.emit("session_start");
  assert.deepEqual([...h.statuses], [[STATUS_KEYS.primary, "Claude · not a subscription login"]]);
});

test("/usage-refresh forces a fetch and explains untracked models", async () => {
  const h = setup(payload);
  await h.emit("session_start");
  await h.command("usage-refresh");
  assert.equal(h.fetches(), 2);
  assert.deepEqual(h.notifications, ["Claude usage refreshed"]);

  h.ctx.model = { provider: "openai", id: "gpt-5" };
  await h.command("usage-refresh");
  assert.equal(h.notifications[1], "Usage is only shown for Codex, Claude, Copilot, Azure Foundry models");
});

test("turns refresh header-less providers once the cache TTL has passed", async () => {
  mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
  const h = setup(payload);
  await h.emit("session_start");
  await h.emit("turn_end", { message: {} });
  await settle();
  assert.equal(h.fetches(), 1);

  mock.timers.tick(61_000);
  await h.emit("turn_end", { message: {} });
  await h.emit("turn_end", { message: {} });
  await settle();
  assert.equal(h.fetches(), 2);
});

const copilotPayload = {
  quota_reset_date_utc: "2026-11-01T00:00:00Z",
  quota_snapshots: { premium_interactions: { entitlement: 27500, remaining: 12698.7 } },
};

function setupCopilot() {
  process.env.GITHUB_TOKEN = "gho_test";
  process.env.HOME = "/nonexistent";
  const h = setup(copilotPayload);
  h.ctx.model = { provider: "github-copilot", id: "claude-opus-5.5" };
  return h;
}

test("copilot shows the running prompt estimate and keeps it after the prompt", async () => {
  const h = setupCopilot();
  await h.emit("session_start");
  assert.equal(h.statuses.get(STATUS_KEYS.primary), `${ICONS.month} ████░░░░ 53.8% 14.8k/27.5k`);
  assert.equal(h.statuses.has(STATUS_KEYS.extra), false);

  await h.emit("agent_start");
  assert.equal(h.statuses.get(STATUS_KEYS.extra), `${ICONS.money} ~0cr`);
  await h.emit("turn_end", { message: { usage: { cost: { total: 0.178 } } } });
  assert.equal(h.statuses.get(STATUS_KEYS.extra), `${ICONS.money} ~17.8cr`);
  await h.emit("turn_end", { message: { usage: { cost: { total: 0.023 } } } });
  await h.emit("agent_end");
  assert.equal(h.statuses.get(STATUS_KEYS.extra), `${ICONS.money} ~20.1cr`);

  await h.emit("agent_start");
  assert.equal(h.statuses.get(STATUS_KEYS.extra), `${ICONS.money} ~0cr`);
});

test("copilot polls for late-booked usage until shutdown", async () => {
  mock.timers.enable({ apis: ["Date", "setInterval"], now: 1_000_000 });
  const h = setupCopilot();
  await h.emit("session_start");
  assert.equal(h.fetches(), 1);

  mock.timers.tick(90_000);
  await settle();
  assert.equal(h.fetches(), 1);

  mock.timers.tick(30_000);
  await settle();
  assert.equal(h.fetches(), 2);

  await h.emit("session_shutdown");
  mock.timers.tick(600_000);
  await settle();
  assert.equal(h.fetches(), 2);
});
