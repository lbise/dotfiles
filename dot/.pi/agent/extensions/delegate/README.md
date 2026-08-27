# Delegate extension

OpenCode-style subagents for Pi. The extension registers `delegate` and `delegate_result`. Each delegated task runs in a child session with its own isolated context window and returns a reusable `task_id`.

## Default agents

- `general` inherits the parent's active built-in tools. Use it for shell commands, git inspection, tests, and file changes.
- `explore` is limited to `read`, `grep`, `find`, and `ls`. Use it only for file-content searches and code inspection. It cannot run shell commands, inspect git state, or execute tests.

A fresh child receives normal project context files and its delegated prompt, but never the parent transcript. A resumed child also retains its own prior history, still without the parent transcript. Intermediate reasoning and tool output stay in the child context. Only final results enter the parent context.

A `delegate` call has distinct human and agent fields:

- `title` is a short human-facing label for the tool row and child session.
- `prompt` is the child's instruction. For a fresh task, include the goal, relevant context and constraints, and expected result. A resumed task may refer to its child history, but never assume parent history.
- `subagent_type` selects `general`, `explore`, or a discovered user or trusted-project agent.
- `mode` is explicitly `foreground` or `background`.

## Execution modes

Use `mode: "foreground"` when the parent needs the result before continuing. The tool blocks until the child finishes and returns its final result.

Use `mode: "background"` when the parent can continue independently. The tool returns a running `task_id` as soon as the child starts. When the child settles, the extension delivers the task result and triggers another parent turn. In the TUI, a widget above the command line lists every running background delegate with an animated spinner and its current activity. Up to eight background tasks can run at once in a parent session.

`delegate_result` can retrieve a background task explicitly:

- `mode: "poll"` returns its current status immediately.
- `mode: "wait"` waits until it settles or `timeout_seconds` expires. Waiting does not cancel the background task on timeout.

## Model settings

Set each agent's default model in Pi's global `~/.pi/agent/settings.json` or project `.pi/settings.json`:

```json
{
  "delegate": {
    "agents": {
      "explore": {
        "model": "parent"
      },
      "general": {
        "model": "anthropic/claude-sonnet-4-5",
        "thinking": "medium"
      }
    }
  }
}
```

`"parent"` uses the parent session's current provider, model, and, unless overridden, thinking level. Any other value must use `provider/model` format. Child sessions can use Pi's built-in providers and providers configured in `models.json`; authentication comes from Pi's normal `auth.json` and environment handling. Runtime-only provider registrations and API-key overrides from the parent are not inherited.

Settings override `model` and `thinking` from an agent's Markdown frontmatter. If neither settings nor frontmatter select a model, the agent inherits the parent. Global and project settings use Pi's normal nested merge rules, so a project can override one agent without repeating the others.

## Custom agents

Add Markdown files to either location:

- user: `~/.pi/agent/agents/**/*.md`
- project: `.pi/agents/**/*.md`

Project definitions override user definitions, and user definitions override packaged defaults.

```markdown
---
name: reviewer
description: Review code without changing files
tools: [read, grep, find, ls]
model: anthropic/claude-sonnet-4-5
thinking: medium
hidden: false
---

Review the delegated code and return findings with file and line references.
```

Supported fields are `name`, `description`, `tools`, `model`, `thinking`, `hidden`, and `disabled`. The filename supplies `name` when omitted. Set `disabled: true` in a higher-priority file to remove an agent.

Project agents load only in trusted projects. Pi asks before each project agent's first run in a parent session and refuses project agents without an interactive UI.

## Task shortcuts

In a saved parent session, the first ten delegated tasks get shortcuts in order: `ctrl+1` through `ctrl+9`, then `ctrl+0`. The assigned shortcut appears in the delegate box header. Press it to open a live detail overlay without replacing the current Pi session. Use `/tasks` to switch to a saved child session. Slots remain available after completion. Ephemeral parent sessions do not get shortcuts because their child sessions are not saved.

Shortcuts are registered for the current parent session and reset after `/reload` or switching sessions.

Foreground delegation follows the parent tool's abort signal. Aborting the parent prompt aborts the child `AgentSession` and disposes it after the run settles. Background delegation is detached after startup; use `/task-cancel <task_id>` to stop it.

## Commands

- `/agents` lists agents and configuration errors.
- `/tasks` selects a child session.
- `/task-parent` returns to the parent session.
- `/task-next` and `/task-prev` move between sibling tasks.
- `/task-cancel <task_id>` cancels a running background task. Without an id, it lists running background tasks.

## Limits

- Background execution requires TUI or RPC mode.
- Background jobs and `delegate_result` retention are process-local. Session replacement keeps running jobs alive and rebinds the delegate UI; `/reload` and exiting cancel them and clear retained results. Shutdown waits up to five seconds for cancellation. Child sessions remain saved, but running jobs do not survive restart.
- `delegate_result` retains the latest 100 settled background results per parent-session process.
- No nested delegation.
- No chain or workflow parameters. Pi can issue several `delegate` calls in one response for parallel work.
- Child sessions load no extensions. Only Pi's built-in coding tools can pass through the parent and agent allowlists.
- Children resolve authentication and provider configuration from Pi's files. Runtime-only API keys, provider registrations, and provider overrides from the parent are not inherited.
- An ephemeral parent gets an ephemeral child. Resuming with `task_id` requires a saved parent session.
- Parallel writers share the same checkout unless the caller provides isolation outside this extension.

Settings and agent-file changes are read on the next prompt or delegation. Run `/reload` after changing the extension code.
