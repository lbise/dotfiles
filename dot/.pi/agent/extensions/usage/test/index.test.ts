import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { afterEach, beforeEach, mock } from "node:test";

import { ICONS } from "../format.ts";
import extension, { STATUS_KEYS, USAGE_EVENT, providerForModel } from "../index.ts";
import { setCopilotCreditCap } from "../providers/copilot.ts";

const realFetch = globalThis.fetch;
const realEnv = { HOME: process.env.HOME, GITHUB_TOKEN: process.env.GITHUB_TOKEN };
// The Anthropic provider shares a cache file between processes; give each test its own.
const realCacheHome = process.env.XDG_CACHE_HOME;
beforeEach(() => {
  process.env.XDG_CACHE_HOME = mkdtempSync(join(tmpdir(), "usage-cache-"));
});
afterEach(() => {
  if (realCacheHome === undefined) delete process.env.XDG_CACHE_HOME;
  else process.env.XDG_CACHE_HOME = realCacheHome;
});
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
  const events: { channel: string; data: any }[] = [];
  let fetches = 0;

  globalThis.fetch = (async () => {
    fetches++;
    return new Response(JSON.stringify(fetchBody));
  }) as typeof fetch;

  extension({
    on: (name: string, handler: Handler) => handlers.set(name, handler),
    registerCommand: (name: string, command: any) => commands.set(name, command),
    events: { emit: (channel: string, data: any) => events.push({ channel, data }) },
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
    events,
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

test("statuses are also sent as plain text in footer order, and withdrawn when cleared", async () => {
  const h = setup(payload);
  h.ctx.ui.theme.fg = (color: string, text: string) => `<${color}>${text}</>`;
  await h.emit("session_start");

  assert.ok(h.events.every((event) => event.channel === USAGE_EVENT));
  const sent = h.events.at(-1)!.data;
  assert.deepEqual(sent.map((item: any) => item.key), Object.values(STATUS_KEYS));
  assert.equal(sent[0].text, `${ICONS.hours} ███░░░░░ 42%`);
  assert.match(h.statuses.get(STATUS_KEYS.primary)!, /^<success>/);

  await h.emit("model_select", { model: { provider: "openai", id: "gpt-5" } });
  assert.deepEqual(h.events.at(-1)!.data, []);
});

test("cached usage is reused within the TTL and refreshed on agent end", async () => {
  mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
  const h = setup(payload);
  await h.emit("session_start");
  await h.emit("agent_start");
  await h.emit("agent_end");
  assert.equal(h.fetches(), 1);
  mock.timers.tick(121_000);
  await h.emit("agent_end");
  assert.equal(h.fetches(), 2);
});

test("pi sessions share one Anthropic fetch", async () => {
  const a = setup(payload);
  await a.emit("session_start");
  const b = setup(payload);
  await b.emit("session_start");
  await b.emit("agent_end");
  assert.equal(a.fetches() + b.fetches(), 1);
  assert.equal(b.statuses.get(STATUS_KEYS.primary), `${ICONS.hours} ███░░░░░ 42%`);
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

  mock.timers.tick(121_000);
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
  assert.equal(h.statuses.get(STATUS_KEYS.extra), `${ICONS.money} ~0cr $0.00`);
  await h.emit("turn_end", { message: { usage: { cost: { total: 0.178 } } } });
  assert.equal(h.statuses.get(STATUS_KEYS.extra), `${ICONS.money} ~17.8cr $0.18`);
  await h.emit("turn_end", { message: { usage: { cost: { total: 0.023 } } } });
  await h.emit("agent_end");
  assert.equal(h.statuses.get(STATUS_KEYS.extra), `${ICONS.money} ~20.1cr $0.20`);

  await h.emit("agent_start");
  assert.equal(h.statuses.get(STATUS_KEYS.extra), `${ICONS.money} ~0cr $0.00`);
});

test("copilot reads the credit cap from settings.json", async () => {
  const { mkdtemp, mkdir, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  let h = setupCopilot();
  process.env.HOME = await mkdtemp(join(tmpdir(), "usage-home-"));
  await mkdir(join(process.env.HOME, ".pi", "agent"), { recursive: true });
  const settings = join(process.env.HOME, ".pi", "agent", "settings.json");

  await writeFile(settings, JSON.stringify({ usage: { copilotCreditCap: 40000 } }));
  await h.emit("session_start");
  assert.match(h.statuses.get(STATUS_KEYS.secondary)!, /% 14\.8k\/40k/);

  await h.emit("session_shutdown");
  await writeFile(settings, JSON.stringify({ usage: { copilotCreditCap: "lots" } }));
  const home = process.env.HOME;
  h = setupCopilot();
  process.env.HOME = home;
  await h.emit("session_start");
  assert.equal(h.statuses.has(STATUS_KEYS.secondary), false);
  assert.equal(h.notifications.at(-1), "settings.json usage.copilotCreditCap must be a positive number");
  await h.emit("session_shutdown");
});

test("copilot polls for late-booked usage until shutdown", async () => {
  mock.timers.enable({ apis: ["Date", "setInterval"], now: 1_000_000 });
  const h = setupCopilot();
  await h.emit("session_start");
  assert.equal(h.fetches(), 1);

  mock.timers.tick(30_000);
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

test("plain statuses carry the window label, percent and time left; the footer is unchanged", async () => {
  mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-10T10:00:00Z") });
  const h = setup({
    five_hour: { utilization: 42.25, resets_at: "2026-10-10T12:10:00Z" },
    seven_day: { utilization: 3, resets_at: "2026-10-13T10:00:00Z" },
    extra_usage: { is_enabled: false },
  });
  h.ctx.ui.theme.fg = (color: string, text: string) => `<${color}>${text}</>`;
  await h.emit("session_start");

  const at = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const day = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  assert.deepEqual(Object.fromEntries(h.statuses), {
    [STATUS_KEYS.primary]: `<success>${ICONS.hours} </><success>███</><dim>░░░░░</><success> 42.3%</>`,
    [STATUS_KEYS.primaryReset]: `<dim>${ICONS.reset} 2h10m ${at("2026-10-10T12:10:00Z")}</>`,
    [STATUS_KEYS.secondary]: `<success>${ICONS.week} </><success>█</><dim>░░░░░░░</><success> 3%</>`,
    [STATUS_KEYS.secondaryReset]: `<dim>${ICONS.reset} 3d ${day("2026-10-13T10:00:00Z")}</>`,
    [STATUS_KEYS.extra]: `<dim>${ICONS.money} </><warning>off</>`,
  });
  assert.deepEqual(
    h.events.at(-1)!.data.map(({ text, ...meta }: any) => meta),
    [
      { key: STATUS_KEYS.primary, label: "5h", resets: "2h 10m", percent: 42.3 },
      { key: STATUS_KEYS.primaryReset, label: "5h", resets: "2h 10m" },
      { key: STATUS_KEYS.secondary, label: "Week", resets: "3d", percent: 3 },
      { key: STATUS_KEYS.secondaryReset, label: "Week", resets: "3d" },
      { key: STATUS_KEYS.extra, label: "Extra" },
    ]
  );
});

test("copilot statuses carry the figures after the bar and the warning tones", async () => {
  const h = setupCopilot();
  await h.emit("session_start");
  const primary = h.events.at(-1)!.data.find((item: any) => item.key === STATUS_KEYS.primary);
  assert.equal(primary.label, "Month");
  assert.equal(primary.detail, "14.8k/27.5k");
  assert.equal(primary.tone, undefined);
  assert.equal(primary.note, undefined);
});

test("anthropic is polled when the shared cache expires, countdowns redrawn every 30 s", async () => {
  mock.timers.enable({ apis: ["Date", "setInterval"], now: Date.parse("2026-10-10T10:00:00Z") });
  const h = setup({ five_hour: { utilization: 42, resets_at: "2026-10-10T12:10:20Z" } });
  await h.emit("session_start");
  assert.equal(h.fetches(), 1);
  const resets = () => h.events.at(-1)!.data.find((item: any) => item.key === STATUS_KEYS.primary).resets;
  assert.equal(resets(), "2h 11m");

  mock.timers.tick(30_000);
  await settle();
  assert.equal(h.fetches(), 1);
  assert.equal(resets(), "2h 10m");

  mock.timers.tick(30_000);
  await settle();
  assert.equal(h.fetches(), 1);

  mock.timers.tick(60_000);
  await settle();
  assert.equal(h.fetches(), 2);

  await h.emit("session_shutdown");
});

test("warning tones travel with the figures they colour", async () => {
  mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-21T00:00:00Z") });
  process.env.GITHUB_TOKEN = "gho_test";
  const h = setup({
    quota_reset_date_utc: "2026-11-01T00:00:00Z",
    quota_snapshots: { premium_models: { entitlement: 16000, remaining: 1200 } },
  });
  h.ctx.model = { provider: "github-copilot", id: "claude-opus-5.5" };
  const { mkdtemp, mkdir, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  process.env.HOME = await mkdtemp(join(tmpdir(), "usage-home-"));
  await mkdir(join(process.env.HOME, ".pi", "agent"), { recursive: true });
  await writeFile(join(process.env.HOME, ".pi", "agent", "settings.json"), JSON.stringify({ usage: { copilotCreditCap: 20000 } }));
  try {
    await h.emit("session_start");
    const sent = (key: string) => h.events.at(-1)!.data.find((item: any) => item.key === key);
    assert.deepEqual(
      [sent(STATUS_KEYS.primary).tone, sent(STATUS_KEYS.primary).detail],
      ["error", "14.8k/16k"]
    );
    const cap = sent(STATUS_KEYS.secondary);
    assert.deepEqual([cap.label, cap.tone, cap.detail, cap.note, cap.noteTone], ["Cap", "warning", "14.8k/20k", "→22.9k", "error"]);
  } finally {
    setCopilotCreditCap(undefined);
  }
});
