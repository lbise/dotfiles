# pi-blackhole assessment

Assessed against [`pi-blackhole` v0.4.6 at commit `49ab560`](https://github.com/k0valik/pi-blackhole/tree/49ab560156fd53b6da1b568d5ade10287b89026c) and this repo's current Pi configuration.

## What it does

`pi-blackhole` combines two mechanisms in one Pi extension:

1. **Algorithmic compaction:** its `session_before_compact` hook replaces Pi's LLM-written summary with a programmatically generated recap. It extracts a session goal, file activity, commits, likely blockers, user preferences, and a compressed transcript; then it appends recall guidance. The compaction step itself makes no model call ([entry point](https://github.com/k0valik/pi-blackhole/blob/49ab560156fd53b6da1b568d5ade10287b89026c/index.ts), [hook](https://github.com/k0valik/pi-blackhole/blob/49ab560156fd53b6da1b568d5ade10287b89026c/src/hooks/before-compact.ts), [section builder](https://github.com/k0valik/pi-blackhole/blob/49ab560156fd53b6da1b568d5ade10287b89026c/src/core/build-sections.ts)).
2. **Observational memory:** three background model-powered workers create observations, turn those into longer-lived reflections, and prune low-value observations. Those memories are stored in the session ledger and injected into later compaction summaries. The `recall` tool and `/blackhole-recall` search the original session JSONL after old messages leave the active model context ([README](https://github.com/k0valik/pi-blackhole/blob/49ab560156fd53b6da1b568d5ade10287b89026c/README.md), [consolidation pipeline](https://github.com/k0valik/pi-blackhole/blob/49ab560156fd53b6da1b568d5ade10287b89026c/src/om/consolidation.ts)).

Consequently, the default complete replacement block is not fully deterministic: the structural compactor is deterministic for a fixed transcript and ledger, but the injected ledger content was produced by LLM workers. Set `memory: false` for the genuinely model-free/deterministic variant.

The structural recap is deliberately lossy. Among other caps, it keeps at most 120 brief-transcript lines, limits tool-call summaries per assistant section, truncates user/assistant prose, omits successful tool results, and caps several extracted lists. Exact recovery depends on the agent using `recall` ([brief builder](https://github.com/k0valik/pi-blackhole/blob/49ab560156fd53b6da1b568d5ade10287b89026c/src/core/brief.ts), [formatter](https://github.com/k0valik/pi-blackhole/blob/49ab560156fd53b6da1b568d5ade10287b89026c/src/core/format.ts)).

## Trigger and defaults

The default configuration is `compaction: "auto"`, `compactionEngine: "blackhole"`, `compactAfterTokens: 81000`, `tailBehavior: "minimal"`, `midRunCompaction: "off"`, and `memory: true` ([configuration reference](https://github.com/k0valik/pi-blackhole/blob/49ab560156fd53b6da1b568d5ade10287b89026c/CONFIG.md)). It checks for auto-compaction at `agent_end`; optional mid-run modes check at `turn_end`.

`tailBehavior: "minimal"` is aggressive: it normally replaces everything before the last user message. `"pi-default"` instead honors Pi's recent-message cut. `/blackhole` always requests blackhole compaction. In `compaction: "manual"` or `"off"`, ordinary `/compact` remains Pi-native.

The 81k threshold is fixed rather than model-relative. This setup currently enables 272k-context OpenAI Codex models and 1.1M-context Copilot models (`pi --list-models`; [`settings.json`](../../dot/.pi/agent/settings.json)), so the default would compact at about 30% and 7% of those windows respectively. A single static threshold cannot fit both model families well.

## Persistence, cost, and security

Configuration lives at `~/.pi/agent/pi-blackhole/pi-blackhole-config.json`. Auto-mode memories are custom session entries. Manual-mode memories accumulate in per-session pending JSON under `~/.pi/agent/pi-blackhole/` until `/blackhole` flushes them. Model cooldowns are persisted there as well ([README](https://github.com/k0valik/pi-blackhole/blob/49ab560156fd53b6da1b568d5ade10287b89026c/README.md)). This is durable session-local memory, not a cross-session knowledge base.

The compactor is zero-model-cost, but default memory is not: observer, reflector, and dropper are separate agent-loop model jobs, with up to 16 turns each by default and configured fallback chains. They send transcript/memory excerpts to the selected providers. Debug options can write sensitive snapshots to `/tmp` or JSONL under the Pi agent directory.

Like every Pi extension, the package executes with the user's full OS permissions. This package also installs a guarded monkey patch around private `AgentSession` internals at startup to support experimental transparent mid-run compaction, even though that mode defaults off. Its manifest supports `@earendil-works/pi-* >=0.81.1 <1.0.0`; the adapter explicitly recognizes known Pi 0.81/0.84 method shapes and fails closed otherwise ([package manifest](https://github.com/k0valik/pi-blackhole/blob/49ab560156fd53b6da1b568d5ade10287b89026c/package.json), [inline adapter](https://github.com/k0valik/pi-blackhole/blob/49ab560156fd53b6da1b568d5ade10287b89026c/src/om/inline-compaction.ts)).

## Compatibility with this setup

No direct compaction-engine collision exists in the configured local extensions:

- `copilot-usage.ts`, `openai-codex-usage.ts`, and `herdr-agent-state.ts` observe lifecycle/provider events but do not compact.
- `rtk.ts` filters only RTK-specific custom context messages and rewrites/tool-routes bash calls; it does not intercept compaction.
- `pi-footer` is UI-only for this purpose.
- `@agnishc/edb-context-viewer` only registers its context-inspection command.

`pi-subagents` does listen to `session_before_compact` and `session_compact`, but it does not provide or cancel compaction. It suspends widgets for non-manual compaction and may send a hidden continuation after compaction when async children are active. Blackhole invokes public `ctx.compact()`, which Pi reports as a manual compaction event, so this is lifecycle interaction rather than competing summary generation. It is worth smoke-testing manual and automatic blackhole compaction while a background child is active.

The repository currently installs no `pi-vcc`, `pi-observational-memory`, `pi-codex-compaction`, or other summary provider. Blackhole's README explicitly requires removing the first two because they compete for the same hooks. It contains an experimental `skipForProviders` shim for `pi-codex-compaction`, but its own source calls that unsupported coupling whose correctness depends on the other extension's implementation ([provider-skip source](https://github.com/k0valik/pi-blackhole/blob/49ab560156fd53b6da1b568d5ade10287b89026c/src/core/provider-skip.ts)).

## Recommendation

There is no reason not to trial it on conflict grounds, but its defaults are not a good fit for this configuration. Start conservatively with:

```json
{
  "compaction": "manual",
  "tailBehavior": "pi-default",
  "midRunCompaction": "off",
  "memory": false
}
```

This isolates the feature being evaluated: deterministic structural compaction via `/blackhole`, without background model calls, fixed-threshold auto-compaction, aggressive last-user-only cuts, or experimental mid-run internals. Compare a few long-session blackhole summaries and `recall` behavior with native `/compact`. Enable memory separately only if the deterministic recap alone loses too much semantic context. If later enabling auto mode, choose and test a threshold deliberately; the mixed 272k/1.1M model set prevents one value from being proportionate for every enabled model.

Pin the trial package version (for example `npm:pi-blackhole@0.4.6`) rather than silently tracking latest, and review updates before moving the pin.
