/**
 * Subscription usage for pi.
 *
 * Shows usage for the active model's provider (Codex, Claude, Copilot) by
 * publishing ctx.ui.setStatus() values for pi-footer External Status widgets.
 * Only one provider is active at a time, so the status keys are generic.
 * /usage-refresh forces a fetch.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { formatReset, formatWindow, renderSegments } from "./format.ts";
import { anthropicProvider } from "./providers/anthropic.ts";
import { codexProvider } from "./providers/codex.ts";
import { copilotProvider } from "./providers/copilot.ts";
import type { AuthSource, PiAuthEntry, PromptTracker, Segment, UsageProvider, UsageSnapshot } from "./types.ts";

// Integration contract with pi-footer.json. Each independently renderable
// value has its own key so the footer can arrange or omit fields.
export const STATUS_KEYS = {
  primary: "usage-primary",
  primaryReset: "usage-primary-reset",
  secondary: "usage-secondary",
  secondaryReset: "usage-secondary-reset",
  extra: "usage-extra",
} as const;

// Keys from the old per-provider extensions. Cleared so they cannot linger after a reload.
const LEGACY_STATUS_KEYS = [
  "openai-codex-usage",
  "openai-codex-primary-usage",
  "openai-codex-primary-reset",
  "openai-codex-secondary-usage",
  "openai-codex-secondary-reset",
  "openai-codex-credits",
  "copilot-usage",
  "copilot-reset",
  "copilot-ai-credits",
];

export const PROVIDERS: UsageProvider[] = [codexProvider, anthropicProvider, copilotProvider];

type ProviderState = {
  snapshot: UsageSnapshot | null;
  fetchedAt: number;
  tracker?: PromptTracker;
  /** Replaces snapshot.extra after a tracked prompt ends. */
  promptExtra?: Segment[];
};

type Ctx = Pick<ExtensionContext, "ui" | "model" | "modelRegistry">;

export function providerForModel(model: unknown): UsageProvider | undefined {
  if (!model || typeof model !== "object") return undefined;
  const { provider, id } = model as { provider?: unknown; id?: unknown };
  return PROVIDERS.find(
    (p) => provider === p.id || (typeof id === "string" && id.startsWith(`${p.id}/`))
  );
}

async function readAuthEntry(provider: string): Promise<PiAuthEntry | undefined> {
  try {
    const raw = await readFile(join(homedir(), ".pi", "agent", "auth.json"), "utf8");
    return (JSON.parse(raw) as Record<string, PiAuthEntry>)[provider];
  } catch {
    return undefined;
  }
}

function authSource(ctx: Ctx): AuthSource {
  return {
    // The registry refreshes expired OAuth tokens under pi's auth file lock.
    apiKey: async (provider) =>
      (await ctx.modelRegistry.getApiKeyForProvider(provider)) ?? (await readAuthEntry(provider))?.access,
    authEntry: readAuthEntry,
  };
}

export default function (pi: ExtensionAPI) {
  const states = new Map<string, ProviderState>();

  function stateFor(provider: UsageProvider): ProviderState {
    let state = states.get(provider.id);
    if (!state) {
      state = { snapshot: null, fetchedAt: 0 };
      states.set(provider.id, state);
    }
    return state;
  }

  function set(ctx: Ctx, key: string, segments: Segment[] | undefined) {
    ctx.ui.setStatus(key, segments?.length ? renderSegments(segments, ctx.ui.theme) : undefined);
  }

  function clear(ctx: Ctx) {
    for (const key of Object.values(STATUS_KEYS)) ctx.ui.setStatus(key, undefined);
  }

  function publish(ctx: Ctx, provider: UsageProvider, state: ProviderState) {
    const snapshot = state.snapshot;
    const reset = (at: number | undefined): Segment[] | undefined => {
      const text = formatReset(at);
      return text ? [{ text, tone: "dim" }] : undefined;
    };

    set(
      ctx,
      STATUS_KEYS.primary,
      snapshot?.primary ? formatWindow(snapshot.primary) : (snapshot?.summary ?? [{ text: provider.name, tone: "dim" }])
    );
    set(ctx, STATUS_KEYS.primaryReset, reset(snapshot?.primary?.resetsAt));
    set(ctx, STATUS_KEYS.secondary, snapshot?.secondary ? formatWindow(snapshot.secondary) : undefined);
    set(ctx, STATUS_KEYS.secondaryReset, reset(snapshot?.secondary?.resetsAt));
    set(ctx, STATUS_KEYS.extra, state.promptExtra ?? snapshot?.extra);
  }

  async function refresh(ctx: Ctx, model: unknown, options: { force?: boolean } = {}): Promise<UsageSnapshot | null> {
    const provider = providerForModel(model);
    if (!provider) {
      clear(ctx);
      return null;
    }

    const state = stateFor(provider);
    if (!options.force && state.snapshot && Date.now() - state.fetchedAt < provider.cacheTtlMs) {
      publish(ctx, provider, state);
      return state.snapshot;
    }

    try {
      state.snapshot = await provider.fetchUsage(authSource(ctx));
      state.fetchedAt = Date.now();
      publish(ctx, provider, state);
      return state.snapshot;
    } catch (err: any) {
      state.fetchedAt = 0;
      clear(ctx);
      set(ctx, STATUS_KEYS.primary, [{ text: `${provider.name} · ${err?.message || "fetch failed"}`, tone: "error" }]);
      return null;
    }
  }

  pi.registerCommand("usage-refresh", {
    description: "Refresh subscription usage for the current model's provider",
    handler: async (_args, ctx) => {
      const provider = providerForModel(ctx.model);
      if (!provider) {
        clear(ctx);
        ctx.ui.notify(`Usage is only shown for ${PROVIDERS.map((p) => p.name).join(", ")} models`, "info");
        return;
      }
      await refresh(ctx, ctx.model, { force: true });
      ctx.ui.notify(`${provider.name} usage refreshed`, "info");
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    for (const key of LEGACY_STATUS_KEYS) ctx.ui.setStatus(key, undefined);
    await refresh(ctx, ctx.model);
  });

  pi.on("model_select", async (event, ctx) => {
    const provider = providerForModel(event.model);
    if (provider) stateFor(provider).promptExtra = undefined;
    await refresh(ctx, event.model, { force: true });
  });

  pi.on("agent_start", async (_event, ctx) => {
    const provider = providerForModel(ctx.model);
    if (!provider?.createPromptTracker) {
      await refresh(ctx, ctx.model);
      return;
    }

    // Trackers need a fresh baseline to compute the prompt's quota delta.
    const state = stateFor(provider);
    state.tracker = provider.createPromptTracker();
    state.promptExtra = undefined;
    state.tracker.start(await refresh(ctx, ctx.model, { force: true }));
  });

  pi.on("after_provider_response", async (event, ctx) => {
    const provider = providerForModel(ctx.model);
    if (!provider?.usageFromHeaders) return;

    const state = stateFor(provider);
    const snapshot = provider.usageFromHeaders(event.headers, state.snapshot);
    if (!snapshot) return;
    state.snapshot = snapshot;
    state.fetchedAt = Date.now();
    publish(ctx, provider, state);
  });

  pi.on("turn_end", async (event, ctx) => {
    const provider = providerForModel(ctx.model);
    if (provider) stateFor(provider).tracker?.turnEnd(event.message);
  });

  pi.on("agent_end", async (_event, ctx) => {
    const snapshot = await refresh(ctx, ctx.model, { force: true });
    const provider = providerForModel(ctx.model);
    if (!provider) return;

    const state = stateFor(provider);
    if (!state.tracker) return;
    state.promptExtra = state.tracker.end(snapshot);
    state.tracker = undefined;
    if (snapshot) publish(ctx, provider, state);
  });
}
