import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import extension, { STATUS_KEYS, providerForModel } from "../index.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

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

  assert.equal(h.statuses.get(STATUS_KEYS.primary), "5h ███░░░░░ 42%");
  assert.match(h.statuses.get(STATUS_KEYS.primaryReset)!, /^Reset (60m|1h)/);
  assert.equal(h.statuses.get(STATUS_KEYS.secondary), "week █░░░░░░░ 3%");
  assert.match(h.statuses.get(STATUS_KEYS.secondaryReset)!, /^Reset 3 days/);
  assert.equal(h.statuses.get(STATUS_KEYS.extra), "extra off");
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
  assert.equal(h.notifications[1], "Usage is only shown for Codex, Claude, Copilot models");
});
