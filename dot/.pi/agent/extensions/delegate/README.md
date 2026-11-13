# Delegate extension

Claude Code-style subagents for Pi. The extension registers one tool, `delegate`. Each delegated task runs in a child session with its own isolated context window and returns a reusable `task_id`.

## Default agents

- `general` inherits the parent's active built-in tools. Use it for shell commands, git inspection, tests, and file changes.
- `explore` is limited to `read`, `grep`, `find`, and `ls`. Use it only for file-content searches and code inspection. It cannot run shell commands, inspect git state, or execute tests.

A fresh child receives normal project context files and its delegated prompt, but never the parent transcript. A resumed child also retains its own prior history, still without the parent transcript. Intermediate reasoning and tool output stay in the child context. Only final results enter the parent context.

A `delegate` call has distinct human and agent fields:

- `title` is a short human-facing label for the tool row and child session.
- `prompt` is the child's instruction. For a fresh task, include the goal, relevant context and constraints, and expected result. A resumed task may refer to its child history, but never assume parent history.
- `subagent_type` selects `general`, `explore`, or a discovered user or trusted-project agent.
- `run_in_background` is optional and defaults to `true`.
- `task_id` continues an earlier child with its history (Claude Code's `SendMessage`).

The model is told not to spawn subagents unless the user asks for one, names an agent type, or a skill or AGENTS.md says to. This is the same rule Claude Code uses. It lives in the prompt and is not enforced. To forbid delegation, remove `delegate` from the active tools.

## Execution modes

Subagents run in the background by default. The call returns the child's `task_id` once its session exists. When the child settles, a `delegate-completion` message is queued as a follow-up: it is delivered when the parent's current run ends, or it starts a new turn if the parent is idle. The parent must not wait for it, poll it or predict it, and it relays what matters to the user. There is no poll tool. In the TUI, a widget above the command line lists the running children. Up to eight can run at once. The running children, foreground ones included, are also sent on Pi's event bus as `delegate:tasks`. The herdr-chat extension shows them in the Herdr chat (`docs/herdr-chat.md`).

`run_in_background: false` blocks until the child finishes and returns its result as the tool result. Use it only when the very next action depends on the result. Print and JSON modes always run in the foreground, because they have no follow-up turn.

### Lifecycle

Background children belong to the parent session and end with it, as in Claude Code. Esc on the parent does not stop them. `/reload`, `/new`, `/resume`, fork and exit interrupt them. Their child sessions stay saved, so `task_id` can continue one.

The parent session file records each background run in a `delegate-task` entry. These entries are not part of the model's context. A run writes `started` when its child session exists. It writes `ended` when the child settles, or on shutdown with status `interrupted`. The rule is that every `started` gets exactly one `ended`, and every `ended` exactly one `delegate-completion` message.

On `session_start`, the extension reconciles the ledger. A run with no `ended` (a crash) gets an `interrupted` ending. An ending that was never delivered (a follow-up lost on reload) is delivered. Both are stored without starting a turn: the transcript shows them at once, and the model reads them with the next prompt.

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

## Child extensions

Child sessions load no extensions by default, but they inherit the providers that parent extensions registered. List package sources in `delegate.extensions` to load them into every child session. Use this for extensions that must shape provider requests, such as `@pi-plugins/claude-oauth`, whose `before_provider_request` hook rewrites Anthropic OAuth payloads:

```json
{
  "packages": ["npm:@pi-plugins/claude-oauth"],
  "delegate": {
    "extensions": ["npm:@pi-plugins/claude-oauth"]
  }
}
```

Each source must match an enabled entry in `packages`, written the same way. Children load the parent's installed copy, so Pi reuses the already-loaded module. Delegation fails if a listed source has no enabled extension.

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

Foreground delegation follows the parent tool's abort signal. Aborting the parent prompt aborts the child `AgentSession` and disposes it after the run settles. Background delegation gets its own signal; use `/task-cancel <task_id>` to stop it.

## Commands

- `/agents` lists agents and configuration errors.
- `/tasks` selects a child session. Switching sessions interrupts running background children, so it asks first.
- `/task-parent` returns to the parent session.
- `/task-next` and `/task-prev` move between sibling tasks.
- `/task-cancel <task_id>` cancels a running background task. Without an id, it lists running background tasks.

## Limits

- Background execution requires TUI or RPC mode.
- Running background children do not survive their parent session (see Lifecycle). Shutdown waits up to five seconds for them to stop.
- No nested delegation.
- No chain or workflow parameters. Pi can issue several `delegate` calls in one response for parallel work.
- Child sessions load no extensions except those listed in `delegate.extensions`. Only Pi's built-in coding tools can pass through the parent and agent allowlists.
- Children resolve authentication and provider configuration from Pi's files. Providers registered by parent extensions (for example `azure-foundry`) are copied into the child. Runtime-only API keys and provider overrides from the parent are not inherited.
- An ephemeral parent gets an ephemeral child. Resuming with `task_id` requires a saved parent session.
- Parallel writers share the same checkout unless the caller provides isolation outside this extension.

Settings and agent-file changes are read on the next prompt or delegation. Run `/reload` after changing the extension code.

## Tests

```sh
cd dot/.pi/agent/extensions
node --import ./delegate/test/pi-resolve.mjs --test delegate/test/*.test.ts
```

`pi-resolve.mjs` resolves Pi's packages from the managed install. `lifecycle.test.ts` runs real Pi sessions with pi-ai's faux provider (`harness.ts`). It scripts parent and child replies, and it decides when each child settles. Nothing touches the network or `~/.pi`.
