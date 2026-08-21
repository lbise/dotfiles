# Claude Code subagent execution and concurrency

Checked 2026-08-20, starting from Anthropic's [Claude Code overview](https://code.claude.com/docs/en/overview) and following its links to the current subagent, tool, agent-team, and background-agent documentation.

## Answers

**Are subagent calls blocking?** It depends on the execution mode.

- A foreground subagent blocks the main conversation until it finishes.
- A background subagent does not. It runs concurrently while the main conversation continues.
- In current interactive sessions, fork mode is on by default and Claude Code runs Agent-spawned subagents in the background. Claude cannot request foreground execution in that mode. Fork mode is off by default under `claude -p` and in the Agent SDK. There, Claude Code still defaults to background, but can use foreground when it needs the result before continuing.
- `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` forces subagents into the foreground.

Source: [Run subagents in foreground or background](https://code.claude.com/docs/en/sub-agents#run-subagents-in-foreground-or-background), [turn fork mode on or off](https://code.claude.com/docs/en/sub-agents#turn-fork-mode-on-or-off).

**Can Claude Code launch multiple subagents concurrently and wait for them?** Yes, with one qualification. Anthropic's documented parallel-research pattern launches separate subagents simultaneously, then Claude synthesizes their results. For background subagents, each result arrives as a completion notification in a later turn, and Claude waits for that notification before reporting the result. The docs do not promise that several *foreground* Agent calls in one model turn are batch-executed concurrently. A foreground subagent is documented simply as blocking.

Sources: [Run parallel research](https://code.claude.com/docs/en/sub-agents#run-parallel-research), [foreground and background result behavior](https://code.claude.com/docs/en/sub-agents#run-subagents-in-foreground-or-background), [Agent tool behavior](https://code.claude.com/docs/en/tools-reference#agent-tool-behavior).

**Can the main agent continue while subagents run in the background?** Yes. This is a first-class mode, not a shell-command workaround. The main conversation can continue, permission prompts from a background subagent appear in that conversation, `/tasks` exposes running work, and completion is delivered later. A running foreground task can also be moved to the background with `Ctrl+B`.

Source: [Run subagents in foreground or background](https://code.claude.com/docs/en/sub-agents#run-subagents-in-foreground-or-background).

## Constraints and distinctions

- Claude Code's documented parallel path is not the same mechanism as OpenCode issuing multiple foreground task tool calls in one response and having the host await that batch. Claude Code has explicit foreground and background lifecycle modes. Its current interactive default uses background execution, later-turn completion notifications, and a task panel. The official docs establish concurrent synthesis, but do not establish parallel execution of a batch of foreground Agent calls.
- The local Pi `delegate` extension now supports both modes. Foreground calls await their children, and Pi can run several calls concurrently when the model emits them in one response. With `mode: "background"`, a call returns its `task_id` after startup and injects a compact completion notice as a later follow-up. The parent retrieves the output by polling or waiting through `delegate_result`. Unlike Claude Code, these jobs are process-local and are cancelled on session shutdown, session switching, reload, or exit. See [`dot/.pi/agent/extensions/delegate/README.md`](../../dot/.pi/agent/extensions/delegate/README.md).
- Claude Code limits Agent-spawned subagents to 20 running per session by default. `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` changes the limit. Resumed subagents and `/subtask` have documented exceptions, while workflows and agent-team teammates use separate limits. Source: [Concurrent subagent limit](https://code.claude.com/docs/en/sub-agents#concurrent-subagent-limit).
- Ordinary subagents remain inside one Claude Code session, use isolated context windows, and normally return only one final result to the parent. They are distinct from background agents, which are independent full sessions, and from experimental agent teams, whose teammates can communicate and share tasks. Sources: [Subagent scope](https://code.claude.com/docs/en/sub-agents), [background agents](https://code.claude.com/docs/en/agent-view), [subagents versus agent teams](https://code.claude.com/docs/en/agent-teams#compare-with-subagents).
- Enabling experimental agent teams changes dispatch semantics. A named Agent call may launch a teammate instead of a subagent. Teammates report through messages rather than returning an Agent result, so an orchestration waiting for a normal subagent result can stall. Source: [Claude spawns teammates instead of subagents](https://code.claude.com/docs/en/agent-teams#claude-spawns-teammates-instead-of-subagents).
- Background subagents receive a smaller built-in tool set than foreground subagents, except conversation forks. Permission prompts still surface in the main session. Source: [Available tools](https://code.claude.com/docs/en/sub-agents#available-tools).
- Nested delegation is supported up to three subagent layers below the main conversation by default. This differs from the local Pi extension, which forbids nested delegation. Source: [Let subagents spawn their own subagents](https://code.claude.com/docs/en/sub-agents#let-subagents-spawn-their-own-subagents).
- Parallel writers need deliberate isolation. A subagent can set `isolation: worktree`; without that setting, parallel workers are not automatically given separate checkouts merely because they are subagents. Source: [Supported frontmatter fields](https://code.claude.com/docs/en/sub-agents#supported-frontmatter-fields).
