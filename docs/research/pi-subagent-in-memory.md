# pi-subagent-in-memory: session changes and TUI state

Assessed at [`de649363a5e6726d981ff595e59cb594d16659d0`](https://github.com/ross-jill-ws/pi-subagent-in-memory/tree/de649363a5e6726d981ff595e59cb594d16659d0), package version 0.3.0. Pi references use the installed 0.84.2 docs and source.

## Keeping a child alive across a session change

The child is a separate in-process `AgentSession`, backed by `SessionManager.inMemory()`. It is not a durable Pi child session. Its durable artifacts are extension-owned `events.jsonl`, `result.md`, `error.md`, and possibly `partial-result.md` under `.pi/subagent-in-memory/<parent-session-id>/subagent_<n>/`.

- `executeSubagent()` creates the child and starts `session.prompt(task)`. Its parent tool signal does not control `session.abort()` directly. [`extensions/index.ts:655-680`](https://github.com/ross-jill-ws/pi-subagent-in-memory/blob/de649363a5e6726d981ff595e59cb594d16659d0/extensions/index.ts#L655-L680), [`extensions/index.ts:907-912`](https://github.com/ross-jill-ws/pi-subagent-in-memory/blob/de649363a5e6726d981ff595e59cb594d16659d0/extensions/index.ts#L907-L912)
- Instead, it races the parent signal against the child run. When the parent signal aborts, it returns a "detached" tool result, then leaves the child promise running and finalizes its files when it settles. [`extensions/index.ts:981-1045`](https://github.com/ross-jill-ws/pi-subagent-in-memory/blob/de649363a5e6726d981ff595e59cb594d16659d0/extensions/index.ts#L981-L1045)
- Pi aborts the outgoing parent session before it emits `session_shutdown` during `/new` or `/resume`, so that abort triggers the detachment path. Pi then invalidates the old extension runtime and creates the replacement session. [`agent-session-runtime.ts`](https://github.com/earendil-works/pi/blob/v0.84.2/packages/coding-agent/src/core/agent-session-runtime.ts), [`extensions.md`, "session_before_switch" and "session_shutdown"](https://github.com/earendil-works/pi/blob/v0.84.2/packages/coding-agent/docs/extensions.md)

So the work continues in the same Pi process, bounded by the child's own timeout, but it does not survive a process exit or restart. The final file is the handoff mechanism, not a resumable conversation.

## The catch after switching sessions

This is intentionally liveness, not continuity. The extension has no `session_shutdown` handler that aborts children, but its next `session_start` resets `subagents`, clears `runningSubagents`, stops the animation timer, and removes the widget. That loses both the cards and the kill handles for detached children. [`extensions/index.ts:1249-1262`](https://github.com/ross-jill-ws/pi-subagent-in-memory/blob/de649363a5e6726d981ff595e59cb594d16659d0/extensions/index.ts#L1249-L1262)

For normal same-directory switches, Pi caches extension factories. That leaves this module's globals shared while a new extension instance calls `session_start`. The old child's closures can still finish and write their files, but its removed card is no longer in the rendered array. Pi clears this cache when reloading resources, and also when the effective cache directory changes, so this is not a sound cross-session state model. [`loader.ts`](https://github.com/earendil-works/pi/blob/v0.84.2/packages/coding-agent/src/core/extensions/loader.ts), [`resource-loader.ts`](https://github.com/earendil-works/pi/blob/v0.84.2/packages/coding-agent/src/core/resource-loader.ts)

## TUI state updates

The UI is a module-level, mutable card store rather than session-persisted state.

- Each child has a `SubagentCard` in `subagents`; live child events update its status, message buffer, and completion time. The event subscriber also sends throttled `onUpdate` progress to the parent tool row. [`extensions/index.ts:149-164`](https://github.com/ross-jill-ws/pi-subagent-in-memory/blob/de649363a5e6726d981ff595e59cb594d16659d0/extensions/index.ts#L149-L164), [`extensions/index.ts:748-903`](https://github.com/ross-jill-ws/pi-subagent-in-memory/blob/de649363a5e6726d981ff595e59cb594d16659d0/extensions/index.ts#L748-L903)
- `requestSubagentRender()` increments a version, mounts one above-editor widget when cards exist, and calls `requestRender()` on the mounted widget and open detail overlay. A 500 ms timer advances elapsed-time and working-status animation while a child is active. [`extensions/index.ts:364-406`](https://github.com/ross-jill-ws/pi-subagent-in-memory/blob/de649363a5e6726d981ff595e59cb594d16659d0/extensions/index.ts#L364-L406)
- `SubagentCardsWidget` caches its rendered lines by terminal width and render version, then recomputes from the current visible slice. [`extensions/index.ts:323-354`](https://github.com/ross-jill-ws/pi-subagent-in-memory/blob/de649363a5e6726d981ff595e59cb594d16659d0/extensions/index.ts#L323-L354) Pi's widget API supports this factory plus explicit removal via `setWidget(key, undefined)`. [`tui.md`, "Widgets above/below editor"](https://github.com/earendil-works/pi/blob/v0.84.2/packages/coding-agent/docs/tui.md)
- The detail view is an overlay. It reads the same card object, shows the latest five activity lines, and its timer requests overlay renders too. [`extensions/index.ts:408-523`](https://github.com/ross-jill-ws/pi-subagent-in-memory/blob/de649363a5e6726d981ff595e59cb594d16659d0/extensions/index.ts#L408-L523)

The design is lean and effective while one parent session remains open. Its weak spot is exactly the requested scenario: session replacement preserves execution and files, but deliberately discards the visible and controllable state of still-running children.

## Primary source files

- Extension implementation: [`extensions/index.ts`](https://github.com/ross-jill-ws/pi-subagent-in-memory/blob/de649363a5e6726d981ff595e59cb594d16659d0/extensions/index.ts), [`extensions/tui-draw.ts`](https://github.com/ross-jill-ws/pi-subagent-in-memory/blob/de649363a5e6726d981ff595e59cb594d16659d0/extensions/tui-draw.ts)
- Extension behavior summary: [`README.md`](https://github.com/ross-jill-ws/pi-subagent-in-memory/blob/de649363a5e6726d981ff595e59cb594d16659d0/README.md)
- Pi lifecycle and extension APIs: [`docs/extensions.md`](https://github.com/earendil-works/pi/blob/v0.84.2/packages/coding-agent/docs/extensions.md), [`docs/tui.md`](https://github.com/earendil-works/pi/blob/v0.84.2/packages/coding-agent/docs/tui.md)
