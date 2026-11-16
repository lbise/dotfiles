# Subagents in the Herdr chat

Status: done (2026-11-13). See ## Comments.

## Problem

- The chat knows nothing about subagents. `delegate` is one `other` step with a title. There is no
  live view of what a child is doing and no way to read its conversation.
- Background mode is wonky. Known case: the parent starts a background task, its turn ends, `/reload`
  runs. `/reload` cancels the pool by design (`session_shutdown` reason `reload`), clears the widget,
  and drops undelivered completions. Nothing reaches the transcript, so the task disappears silently.
  `docs/research/pi-subagents-background-instructions.md` documents the earlier lost-completion bug in
  the same lifecycle code.

## Prior assessment

`docs/research/subagents-value-and-execution-modes.md` (2026-10-16) compared Claude Code, Codex and
OpenCode. Its decision: keep subagents for foreground isolation and parallel fan-out. Background mode
is a UX choice with no measured quality gain, takes about a third of `delegate`, and causes most of
its lifecycle bugs. If it stays, shrink it to OpenCode's shape: a flag, one completion message, no
poll tool, and cancellation on session switch.

Claude Code's UX is the target for display, not lifecycle. It shows a task list (`/tasks`) and lets
you open a subagent's transcript. Its background agents also die with the process.

## Facts the plan relies on

- Every child is a saved Pi session (`SessionManager`, header `parentSession`) when the parent is
  saved. The file grows while the child runs, so the mod can read it like the parent's.
- `delegate` tool results already store `details.taskId` and `details.sessionPath` in the parent's
  session file. Finished children can be found from the transcript without a new protocol.
- While a foreground child runs, `onUpdate` sends `TaskProgress` (sessionPath, agent, currentTool,
  activity, turns, tokens, cost). Other extensions see it through `tool_execution_update`.
  herdr-chat does not need to import delegate code.
- Parallel foreground calls in one response already run concurrently.

## Claude Code alignment (from a live Opus 5.5 session, 2026-11-13)

Source: `~/claude-notes/claude-code-system-prompt.md`, Part 3, the verbatim `Agent` tool description.
The file contains personal data, so do not copy it into the repo.

- **Spawning is user-triggered**: "Do not spawn agents unless the user asks." A task described as
  having "multiple angles", needing to be "thorough", or having several parts is not a request to
  spawn. The stated reason is cost ("on this plan"), not quality. Codex below `ultra` and OpenCode on
  GPT models do the same. `delegate` does the opposite: its injected system prompt advertises
  delegation as a way to keep context clean, which invites spawning on its own.
- **Background only.** In that session `Agent` has no `run_in_background` parameter: "Subagents run
  in the background; you'll be notified when one completes." There is no poll tool.
  `SendMessage` continues an agent, which is our `task_id` resume. `TaskStop` cancels one.
- "Never fabricate or predict a pending agent's results... if the user asks before it arrives, say
  it's still running." "The agent's final report is not shown to the user — relay what matters."
- Model, effort and tools come from the agent definition. `delegate` already works this way.
- Not adopting: `fork` (a child that inherits the parent context), worktree or remote isolation, and
  the `Workflow` tool.

### Resulting changes to `delegate`
1. Make spawning user-triggered. Replace the "use delegation to keep context clean" pitch with Claude
   Code's rule, adapted for this setup: spawn only when the user, a skill, or AGENTS.md asks for
   subagents or names an agent type. Keep it in the prompt and do not enforce it in code. To forbid
   delegation completely, remove `delegate` from the active tools.
2. Make background the default. Keep `mode: "foreground"` only for "my very next step needs this and
   nothing else can happen meanwhile", which is Claude Code's non-interactive rule. Once the user has
   asked for subagents, they normally want to see them in the list and keep chatting.
3. Add the no-fabrication and relay-the-report lines to the guidelines word for word.

## Decision: background mode

Chosen: **B in Claude Code's shape.** Claude Code's `Agent` tool uses `run_in_background`. It sends
one completion notification in a later turn and has no poll tool ("Don't peek"). Its tasks die with
the process. Mirror that: keep background, drop `delegate_result`, and cancel on reload or switch with
a visible aborted entry. A was the alternative considered:

- **A. Cut it (recommended).** Delete `background.ts`, `delivery.ts`, `delegate_result`, the widget,
  `/task-cancel` and pool code that outlives a session. Fan-out stays as parallel foreground calls.
  The chat steers a working Pi, so you can still talk to the parent while children run. `/reload`
  mid-run aborts the turn, and the aborted tool result is saved in the transcript. Nothing vanishes.
- **B. Shrink to OpenCode shape.** Keep `mode: "background"` and one completion message. Drop
  `delegate_result` and survival across session switches. On reload or switch, cancel the tasks and
  write an `aborted` completion entry before shutdown, so the transcript shows what happened.
  Background tasks have no tool call that is still running, so the chat also needs a state field fed
  by the delegate extension through `pi.events`.

The chat work below is the same for A and B, except where B is noted.

## Reliability: fixing background properly

### Why it has been buggy
Background state lives only in memory. A module-global pool outlives the extension instance and
rebinds callbacks across instances: `suspendCallbacks`, `setCallbacks`, a queue of undelivered
completions, steer or follow-up chosen from a stale `ctx.isIdle()`. Every bug so far has been a race
in that handoff, or memory dropped on `/reload`. Prompt wording added a second class: the parent
answered without waiting.

### Design rules
1. **Durable ledger.** The parent session file is the source of truth. `pi.appendEntry` writes
   `delegate-task` entries `{ taskId, phase: "started" | "ended", status, sessionPath, title, agent }`.
   These entries are not in the model's context.
   An `ended` entry is written the moment a child settles, before any delivery is attempted.
2. **Invariant.** Every `started` gets exactly one `ended`. Every `ended` gets exactly one
   `delegate-completion` message in the transcript. Tests and reconciliation check this.
3. **No cross-instance state.** No module globals. The task set belongs to one extension instance.
   On any `session_shutdown`, abort the children and write `ended` with status `interrupted`. This
   matches Claude Code, whose tasks die with the session. Children are saved sessions, so an
   interrupted task can be resumed with `task_id`, our equivalent of `SendMessage`.
4. **Reconcile on `session_start`.** Run one pure function over the ledger:
   - a `started` with no `ended` (crash, SIGKILL, write lost on shutdown): write `ended interrupted`;
   - an `ended` with no completion message: deliver it now.
   Shutdown and crash paths are handled by the same code, so they don't need separate handling.
5. **One delivery path.** Always send `sendMessage` with `deliverAs: "followUp"` and
   `triggerTurn: true`, and stop branching on `isIdle()`. Pi's documented semantics cover both cases.
   A queued follow-up lost on reload is caught by rule 4.
6. **No poll tool.** Remove `delegate_result`. The prompt rules are Claude Code's word for word
   (never fabricate, say it's still running, relay what matters).

### How we prove it
- **Unit**: the reconcile function over hand-built ledgers (every mix of `started` / `ended` /
  completion, duplicates, unknown ids). It is pure, so the coverage can be exhaustive and cheap.
- **Integration, real Pi with no network**: SDK `createAgentSession` plus `AgentSessionRuntime`, the
  delegate extension and pi-ai's faux provider, which scripts both parent and child replies. A
  deferred child reply controls exactly when the child settles. Scenarios, one test each, each
  asserting the invariant on the session file and what the faux parent model saw:
  1. the child settles while the parent is streaming;
  2. the child settles while the parent is idle (a new turn starts);
  3. several children settle in the same tick;
  4. `/reload` mid-run: the task is `interrupted`, the model is told once, the task can be resumed;
  5. `/new`, `/resume`, fork mid-run: the same, nothing leaks into the new session;
  6. a crash simulated by killing the runtime without shutdown, then reopening: reconcile fixes it;
  7. the parent aborts (Esc) mid-run: the background child keeps running and still delivers;
  8. the child fails, startup fails, or the concurrency limit is hit;
  9. the parent model asks about a pending task: the transcript holds no fake result (prompt check,
     best effort).
  Spike first: confirm that the faux provider can be registered for child sessions (the child uses
  its own `ModelRuntime`) and that the SDK can trigger a reload.
- **Regression names**: one test per bug seen so far: the lost completion across session
  replacement, `/reload` vanishing, and the parent answering early.
- **Manual through the chat**: two parallel explores, open one, reload, resume.

Write the failing integration tests first (red), then rebuild. The current `background.test.ts`
tests pool internals that are going away.

## Plan

### 1. delegate extension
- Apply "Resulting changes to `delegate`" above: user-triggered spawning, background by default,
  Claude Code's guideline wording.
- A: remove the background layer and its tests, README sections and prompt text. Keep foreground,
  parallel calls, `task_id` resume, `/tasks`, `/task-parent` and Ctrl+digit detail overlays.
- B: as above, but keep a trimmed pool. Add the aborted-entry-on-shutdown fix and emit
  `delegate:tasks` on `pi.events`.
- Send one `onUpdate` with `sessionPath` as soon as the child session exists, before the first
  model call, so the chat can open a child at once.

### 2. herdr-chat extension: `state.json` gains `tasks`
```jsonc
"tasks": [ { "id": "toolu_…", "taskId": "…", "title": "Audit", "agent": "explore",
  "status": "running", "sessionPath": "/…jsonl", "currentTool": "grep", "model": "…",
  "startedAt": 1, "endedAt": null, "turns": 3, "tokens": 12000, "cost": 0.04 } ]
```
- Built from `tool_execution_start/update/end` for `delegate` in the current turn. B: merged with the
  `delegate:tasks` events.
- Cleared with `turn`, because the transcript records finished tasks.
- Document the field in `docs/herdr-chat.md`.

### 3. Mod: subagent list
- A strip above the composer while any task runs, like Claude Code's task panel. It shows one row per
  child: spinner or status mark, agent, title, current tool, elapsed time and tokens. When the turn
  ends, it collapses to "N subagents".
- The delegate step in the timeline gets its own row (agent, title, status, cost) instead of the
  generic `other` step. It reads `details` from the tool result and `state.tasks` while the task runs.
- Clicking either one opens the child.

### 4. Mod: child conversation view
- Clicking opens the chat in a read-only child mode for that `sessionPath`. It uses a second `chat`
  model that reads that file by offset with the existing transcript parser. It polls fast while the
  task runs and stops when the task ends.
- The header shows a breadcrumb (`Parent › Explore: Audit`) and a back control. Esc goes back. The
  composer is hidden in this mode.
- Before reading, check that the path is an existing `.jsonl` file under the Pi sessions directory.
  The path comes from a file, so validate it like the inbox `resume` path.
- No session switch happens in Pi. The parent keeps running, unlike `/tasks`, which replaces the
  session.

### 5. Tests
- Extension: the delegate update sequence turns into `tasks`, including an aborted end.
- Mod model: the transcript parser reads delegate details, and the poll command uses an explicit
  session path.
- Manual: two parallel explores, open one while it runs, go back, run `/reload` mid-run (A: the step
  shows as aborted).

## Out of scope
- Chatting with or steering a child from its view. Resume through `task_id` is still the parent's
  job.
- Nested subagents and worktree isolation.

## Comments

2026-11-13: implemented.
- delegate: `ledger.ts` holds the reconcile logic, as a pure function. `index.ts` keeps its runs per instance and has no module globals. `background.ts`, `delivery.ts` and `delegate_result` are removed. The parameter is now `run_in_background`, and the prompt uses Claude Code's wording.
- Tests: `delegate/test/lifecycle.test.ts` runs real Pi with the faux provider, one test per scenario of this spec. Run them with `node --import ./delegate/test/pi-resolve.mjs --test delegate/test/*.test.ts` from `dot/.pi/agent/extensions`.
- herdr-chat: `state.tasks` comes from the `delegate:tasks` event. The mod adds a task strip, subagent lines, delegate steps that open their subagent, and a read-only child view.
- Checked by hand in the dev window: parallel explores, the strip while running, the live child view, and `/reload` mid-run, which shows an "interrupted" line.
- Two deviations from the spec. The tasks list comes from the delegate extension through `pi.events` rather than from `tool_execution_update`, because background runs outlive their tool call. The Esc on parent decision is to leave background children running.
