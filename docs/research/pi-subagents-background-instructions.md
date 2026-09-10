# pi-subagents background-task instructions

Assessed `tintinweb/pi-subagents` at [`4f572eaa04c09d3dbc16e4a5f13a16b295e84e14`](https://github.com/tintinweb/pi-subagents/tree/4f572eaa04c09d3dbc16e4a5f13a16b295e84e14) on 2026-03-10. Local comparisons refer to `dot/.pi/agent/extensions/delegate/`.

## What pi-subagents tells the parent

`Agent` defaults to detached work. Its README says the call returns an ID, the completion notification carries a preview, and `get_subagent_result` gets the full text. Foreground mode returns the output inline instead. [README](https://github.com/tintinweb/pi-subagents/blob/4f572eaa04c09d3dbc16e4a5f13a16b295e84e14/README.md#L68-L75)

The model-facing description is more direct. It says to use foreground only when the next action depends on the result and nothing useful can happen meanwhile. For background work it says: do not sleep, poll, or predict the result; keep working or reply to the user. It also says that the completion arrives in a later turn and that the parent, not the child, must summarize it for the user. [tool description](https://github.com/tintinweb/pi-subagents/blob/4f572eaa04c09d3dbc16e4a5f13a16b295e84e14/src/index.ts#L1475-L1510) The registered prompt guideline repeats the no-poll rule. [tool registration](https://github.com/tintinweb/pi-subagents/blob/4f572eaa04c09d3dbc16e4a5f13a16b295e84e14/src/index.ts#L1582-L1589)

That contract matches the implementation. Completion emits a `followUp` with `triggerTurn: true`; its XML contains a bounded result preview. [completion delivery](https://github.com/tintinweb/pi-subagents/blob/4f572eaa04c09d3dbc16e4a5f13a16b295e84e14/src/index.ts#L472-L484) `get_subagent_result` can instead wait for a queued or running agent, returns its full result, and marks a settled result consumed so the pending notification is suppressed. [result tool](https://github.com/tintinweb/pi-subagents/blob/4f572eaa04c09d3dbc16e4a5f13a16b295e84e14/src/index.ts#L2730-L2805)

## Comparison and likely failure modes

The local extension has the same basic shape but weaker parent guidance.

- Its README correctly says foreground is for a result needed before continuing and background is for independent work. It promises that settlement delivers the result and starts another parent turn. [`delegate/README.md`](../../dot/.pi/agent/extensions/delegate/README.md#L20-L29)
- The injected system prompt compresses that to "Background returns a task_id immediately, delivers a completion notice later, and exposes output through delegate_result." [`delegate/index.ts`](../../dot/.pi/agent/extensions/delegate/index.ts#L94-L105) The `delegate` tool guideline says only not to duplicate the child's work. [`delegate/index.ts`](../../dot/.pi/agent/extensions/delegate/index.ts#L338-L345)
- `delegate_result` says to poll while other work remains and wait only when progress depends on the task. [`delegate/index.ts`](../../dot/.pi/agent/extensions/delegate/index.ts#L429-L455) It never says that a background start has no usable result, that a later completion follow-up is the result to read, or that foreground is required when the answer or next step is gated.
- Unlike pi-subagents, local completion already contains the truncated final output and triggers a follow-up turn. [`delegate/index.ts`](../../dot/.pi/agent/extensions/delegate/index.ts#L307-L325) Telling the parent to fetch it again can make the completion look optional rather than the handoff it is.

The wording can therefore produce the reported behavior: the parent launches background work, then continues or answers without a barrier. The only explicit lifecycle instruction after launch is "do not duplicate," and the system prompt's promise of a later notice does not tell the parent what to do with that notice.

There is also a real lifecycle hole that wording cannot repair. On session replacement, the extension intentionally keeps the shared pool running but replaces its settlement callback with a no-op. [`delegate/index.ts`](../../dot/.pi/agent/extensions/delegate/index.ts#L471-L483) If a task settles between that shutdown and construction of the replacement extension, the pool retains the result but sends no follow-up. This conflicts with the README claim that replacement rebinds the UI. [`delegate/README.md`](../../dot/.pi/agent/extensions/delegate/README.md#L98-L100) By contrast, pi-subagents clears completed records before switching and aborts all live agents during shutdown, so it does not promise a completion after the parent session has gone away. [session lifecycle](https://github.com/tintinweb/pi-subagents/blob/4f572eaa04c09d3dbc16e4a5f13a16b295e84e14/src/index.ts#L1090-L1123)

## Recommended instruction changes

Use these exact additions, without changing the tool behavior:

1. Add this `delegate` prompt guideline and the equivalent injected-system-prompt text:

   > Use `mode: "foreground"` when this task's result is needed for your next action or final answer. `mode: "background"` returns only a task_id. Continue only with work independent of that result. When a `delegate-completion` follow-up arrives, treat its `<task>` body as the child result: inspect it, then use or summarize it before claiming the delegated work is complete.

2. Replace the `delegate_result` guideline with:

   > Do not poll in a loop. Use `mode: "wait"` as a barrier when a known background task now gates your next action and its completion follow-up has not arrived. Use `mode: "poll"` only for a status check. Read the returned `<task>` result before continuing.

3. Qualify the automatic-delivery promise in the injected prompt and tool result:

   > A completion follow-up is delivered while this parent session remains active. After switching or resuming a session, use `delegate_result` with the task_id to recover a retained result.

The third change makes the current lifecycle limit honest. It does not fix the lost follow-up window. A later implementation should queue undelivered completions by parent session and replay them after the replacement binds, or cancel jobs on replacement as pi-subagents does.
