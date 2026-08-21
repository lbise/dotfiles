# OpenCode-style subagents for Pi

## Recommendation

Build a small `delegate` extension, not an orchestration framework.

OpenCode's useful idea is simple: the parent model gets one tool that starts a named agent in a fresh child session. Agent definitions supply the prompt, model, and allowed tools. The child streams a compact activity summary into the parent tool row, returns one final result, and remains available as a normal saved session.

That is the part worth copying. Parallelism should come from Pi's existing parallel tool calls. Multi-step workflows should stay in prompts or skills. Do not add `parallel`, `chain`, missions, worktrees, schedulers, agent management, or review-loop policy to the first version.

The best Pi implementation is an in-process child `AgentSession` created through Pi's SDK. Start with a short spike because Pi's canonical subagent example uses subprocesses instead. If the SDK path exposes lifecycle bugs, keep the same extension interface and replace the runner with the proven subprocess adapter.

Implementation note: the current `delegate` extension has moved beyond the foreground-only first version described below. It supports explicit foreground and background modes, compact follow-up completion notices, `delegate_result` polling or waiting, and cancellation. Background jobs still stop on session shutdown and do not survive process restart.

## Source version

The checkout at `/home/13lbise/gitrepo/opencode` is now on `b155b15694dbcc6768f11d2f25cc2bdd1f738ab4`, OpenCode 1.18.19, and matches `origin/dev`. OpenCode citations below refer to that commit.

The Pi sources are the installed `@earendil-works/pi-coding-agent` package under `/home/13lbise/.nvm/versions/node/v24.14.0/lib/node_modules/@earendil-works/pi-coding-agent`.

## What OpenCode does

### One task tool

The tool takes a short description, a prompt, a subagent name, and an optional prior task id. Background execution is an optional experimental flag. It does not expose chain or workflow objects (`packages/opencode/src/tool/task.ts:39-66`).

Its prompt tells the parent to use multiple ordinary task calls in one model response for concurrency. It also tells the parent not to duplicate delegated work (`packages/opencode/src/tool/task.txt:1-25`). This keeps composition in the model's normal tool-calling loop.

### Named agent definitions

An agent contains a name, description, `primary | subagent | all` mode, optional model and prompt, permissions, provider options, optional step limit, visibility, and display color (`packages/opencode/src/agent/agent.ts:33-66`). OpenCode merges built-ins with user configuration (`agent.ts:121-238, 280-326`).

The current source provides two callable subagents by default:

- `general` is the broad worker. It inherits the normal permission set and only denies todo tools explicitly. It can edit files and run commands (`agent.ts:181-195`; `packages/opencode/test/agent/agent.test.ts:163-171`).
- `explore` is the codebase search agent. It allows grep, glob, list, bash, web fetch/search, and read, while denying edits and todo tools (`agent.ts:196-218`; `agent.test.ts:112-132`).

The English documentation still claims a third built-in named `scout`, but the implementation removed that experimental agent and its repository-cloning tools in commit `a639fe7a08dfa27084685b808d4c44a086a5c20b`. The current source and default-agent test contain no `scout` (`agent.test.ts:48-58`). Treat the docs as stale on this point.

The task tool description only advertises agents the caller may invoke. A denied subagent disappears from the description, reducing invalid calls (`packages/opencode/test/tool/task.test.ts:180-217`).

### Fresh, durable child sessions

A new invocation creates a saved session with `parentID`, agent name, title, and derived permissions. The child receives only the delegated prompt as its first user message. It inherits the parent's current model unless the agent overrides it (`packages/opencode/src/tool/task.ts:145-203`).

The returned child session id is also the task id. Passing it later resumes the same child history instead of creating another child (`task.ts:145-203`; `packages/opencode/test/tool/task.test.ts:219-257`).

### Restricted children

OpenCode carries parent deny rules and external-directory restrictions into the child. The child's own rules decide its remaining capabilities. Todo and nested task access default to denied unless the child agent explicitly configures them (`packages/opencode/src/agent/subagent-permissions.ts:1-29`). A configurable depth limit defaults to one (`packages/opencode/src/tool/task.ts:113-132`).

Parent cancellation cancels the child run (`task.ts:298-335`; `packages/opencode/test/tool/task.test.ts:304-351`).

### Inline progress and inspectable sessions

Task metadata contains the parent id, child id, model, and background status. The TUI loads the child session, shows its current tool and completion summary, and opens the child when the task row is selected (`packages/tui/src/routes/session/index.tsx:2221-2322`).

The child view has parent, previous-child, and next-child controls plus token and cost information (`packages/tui/src/routes/session/subagent-footer.tsx:1-132`). Child sessions can also be entered from the parent through dedicated commands (`packages/tui/src/routes/session/index.tsx:1033-1081`).

OpenCode's background mode keeps the same child run alive, can promote foreground work to background, can append another prompt to a running task, and injects completion back into the parent (`packages/opencode/src/tool/task.ts:205-335`). This feature is still experimental, so it should not set the Pi MVP scope.

## What Pi already provides

Pi ships a subagent extension example at `examples/extensions/subagent/`. It already has Markdown agent discovery, model and thinking inheritance, tool allowlists, streaming JSON event parsing, abort propagation, custom tool rendering, parallel limits, and chain mode. It starts a separate `pi --mode json --no-session` process for every child (`examples/extensions/subagent/index.ts`, especially `runSingleAgent`).

The parts to reuse are:

- agent discovery and frontmatter parsing from `examples/extensions/subagent/agents.ts`
- activity and usage rendering from `examples/extensions/subagent/index.ts`
- the subprocess runner as a fallback
- project-agent trust handling

The parts to remove are the `tasks` and `chain` tool parameters. They make the tool more opinionated than OpenCode and duplicate Pi's normal parallel tool calls and prompt system.

Pi's SDK can create a child `AgentSession` with selected tools, model, thinking level, system prompt, working directory, and a persistent `SessionManager` (`docs/sdk.md`, sections "createAgentSession", "Tools", and "Session Management"). It emits message, turn, and tool events and supports `abort()` and `dispose()`.

Pi sessions are JSONL files. Their headers can record a `parentSession` path, and `SessionManager.list()` exposes `parentSessionPath` (`docs/session-format.md`; `dist/core/session-manager.d.ts:1-15, 122-137`). Pi's built-in session selector already builds parent-child trees from that field (`dist/modes/interactive/components/session-selector.js`).

Commands can switch sessions through `ctx.switchSession()`, but tool renderers and extension shortcuts cannot. This means an extension can provide `/tasks`, `/task-parent`, `/task-next`, and `/task-prev`, but it cannot exactly copy OpenCode's clickable row or direct navigation keys through Pi's current public extension interface (`dist/core/extensions/types.d.ts:209-286, 906-910`).

## Proposed behavior

### Default and custom agent files

Ship two defaults as Markdown files inside the extension rather than hard-coding them:

- `general.md` is a broad child worker. Omitting `tools` makes it inherit the parent's active built-in tools, still subject to the parent capability ceiling. Version one does not load parent extensions into the isolated child, so extension-provided tools are unavailable.
- `explore.md` is strictly read-only with `read`, `grep`, `find`, and `ls`. Unlike OpenCode's `explore`, omit `bash` because a plain Pi bash allowlist cannot prevent writes.

Use one format and three discovery locations:

1. packaged defaults in `dot/.pi/agent/extensions/delegate/agents/**/*.md`
2. user agents in `~/.pi/agent/agents/**/*.md`
3. project agents in `.pi/agents/**/*.md`

Precedence is project, then user, then packaged default. A custom file with the same name replaces the lower-priority definition. Support `disabled: true` so a user or project can remove a packaged default without editing the extension.

Start with this frontmatter:

```markdown
---
name: explore
description: Fast read-only codebase search
model: anthropic/claude-haiku-4-5
thinking: low
tools: [read, grep, find, ls]
hidden: false
---

You are a codebase explorer. Return compressed findings with file and line references.
```

`name` may default to the filename. Require `description` unless `disabled: true`. Support `model`, `thinking`, `tools`, `hidden`, and `disabled`. Treat every enabled definition as a subagent in version one. Leave primary-agent switching, provider options, temperature, and step limits for later.

Discovery should return diagnostics for malformed files instead of silently dropping them. `/agents` should identify each definition as packaged, user, or project and show which file won when names collide.

### Model-visible tool

Register `delegate` with a human-facing title, a self-contained child prompt, an explicit execution mode, and a dynamically discovered agent name:

```ts
{
  title: string,
  prompt: string,
  subagent_type: string,
  mode: "foreground" | "background",
  task_id?: string
}
```

Register `delegate_result` separately with `task_id`, `mode: "poll" | "wait"`, and an optional timeout. Build the delegation guidance dynamically from visible, allowed agents. Keep denied or hidden agents out of the list. Results should include the child session id in a stable, easy-to-reuse form.

Do not add a parallel field. If the parent wants three agents, it should issue three `delegate` calls in one assistant response.

### Context and model rules

A fresh child gets:

1. Pi's normal project context files for the selected `cwd`.
2. The agent body appended to the child system prompt.
3. A fixed instruction that names the child role, requires a concise final report, and forbids nested delegation in version one.
4. The delegated prompt as the only user message.

Do not copy the parent transcript. The parent must write a self-contained delegation prompt. A resumed task opens the prior child session and adds the new prompt.

If the agent omits `model`, inherit the parent's exact model and thinking level. If it specifies a model, use the agent's thinking setting or Pi's normal default for that model.

### Tool and trust rules

The child tool set must be the intersection of:

- built-in tools active in the parent session
- tools allowed by the agent definition

An agent cannot gain a tool that the parent does not have. Child sessions run with extensions disabled, so active extension-provided tools are omitted rather than advertised without an implementation. Supporting selected extension tools needs a later design for loading their executable definitions without loading every extension recursively.

Project agents only load when `ctx.isProjectTrusted()` is true. Ask once per parent session before the first execution of each project-defined agent. In non-interactive modes, fail closed unless configuration explicitly trusts project agents.

Version one should use allowlists rather than OpenCode's full `allow | ask | deny` matcher. Add per-call permissions only after the runner and session model are stable. When added, serialize prompts so concurrent children cannot open overlapping confirmation dialogs.

### Sessions and resume

For a new task:

1. Read the current parent session file. Require a persisted parent for durable child lineage.
2. Open a separate `SessionManager` on that parent file.
3. Call `newSession({ parentSession: parentFile })` on the separate manager. This creates a fresh child file without changing the interactive parent's manager.
4. Set a useful child session name such as `Explore: find auth flow`.
5. Create and run the child `AgentSession` with that manager.
6. Persist the child session id and path in the parent tool result details.

For `task_id`, find the matching session with `SessionManager.list(ctx.cwd)`, require its `parentSessionPath` to match the current parent, open it, and continue its existing history. Reject ids from another parent or working directory.

If the parent is ephemeral, either run an in-memory child and return a non-resumable id or reject with a clear error. I prefer the in-memory fallback because it preserves basic delegation in `--no-session` mode.

### Progress, result, and cancellation

Subscribe to child events and keep bounded details:

- status: queued, running, completed, failed, aborted
- current tool name and compact arguments
- last few completed tool calls
- last text preview
- turns, tokens, cost, model
- child session id and path

Call the parent tool's `onUpdate` when status changes, not for every token. The collapsed row should show agent, task description, current tool, and usage. Expanded output should show the prompt, tool history, final Markdown, and child id.

On parent abort, call `child.abort()`, wait for it to settle, then `dispose()`. Always dispose child sessions and unsubscribe listeners in `finally`.

### Human commands

Add:

- `/agents` to list discovered agents and diagnostics
- `/tasks` to select a child of the current parent and call `ctx.switchSession()`
- `/task-parent` to return to the header's `parentSession`
- `/task-next` and `/task-prev` to move among siblings

Pi's `/resume` picker should also show the lineage automatically because it already understands `parentSessionPath`.

## Module design

Put the extension under `dot/.pi/agent/extensions/delegate/`.

```text
delegate/
  index.ts          extension registration only
  agents/
    general.md      broad default worker
    explore.md      read-only default explorer
  agents.ts         discovery, parsing, precedence, diagnostics
  runner.ts         child lifecycle behind runTask(request, callbacks)
  sessions.ts       create, find, validate, and navigate child sessions
  policy.ts         trust checks and parent/agent tool intersection
  render.ts         call/result components
  test/
```

Keep `index.ts` thin. The deep module is `runTask()`: callers give it one request and progress callbacks; it hides resource loading, session creation, model resolution, event collection, cancellation, and cleanup. Tests should exercise the same interface as the tool.

Do not introduce a general runner adapter interface until the SDK spike proves that a second subprocess implementation is needed. One implementation does not justify a seam.

## Delivery plan

### Phase 0: SDK spike

Build a throwaway script outside the extension that:

- creates a persisted child with a parent header
- runs it with `noExtensions: true`
- limits tools to read-only tools
- streams one tool event
- aborts a long operation
- disposes cleanly
- reopens the child and sends a second prompt

Success means the child contains no parent conversation, the parent file is unchanged, lineage appears in `SessionManager.list()`, and resume retains child history. Time-box this phase. If any invariant fails, use the canonical subprocess runner and add persistence through RPC mode rather than patching Pi internals.

### Phase 1: minimal foreground delegation

Implement the packaged `general` and `explore` definitions, layered Markdown discovery, dynamic tool description, one foreground child, model inheritance, tool intersection, bounded progress, final rendering, abort, and error handling.

Acceptance checks:

- an `explore` agent can inspect a repo but cannot edit
- two ordinary `delegate` calls can run concurrently through Pi's parallel tool execution
- Ctrl+C aborts both parent tool execution and child
- malformed agent files produce diagnostics without hiding valid agents
- project agents require trusted-project handling

### Phase 2: durable lineage and resume

Add parent-linked child session files, `task_id`, `/tasks`, and `/task-parent`. Verify that `/resume` groups child sessions under the parent.

Acceptance checks:

- a completed child survives Pi restart
- `task_id` continues the same history
- a task id from another parent is rejected
- deleting or switching sessions does not leave a live child runtime

### Phase 3: permission rules

Only if tool allowlists feel too coarse, add OpenCode-like `allow | ask | deny` rules for tool names and selected inputs. Preserve the parent capability ceiling. Add a serialized confirmation broker and fail closed without UI.

### Phase 4: background work

Treat this as a separate feature. It needs durable job state, completion delivery into the correct parent session, restart recovery, promotion, cancellation, and protection against updating a stale extension instance. OpenCode marks the equivalent feature experimental, so there is no reason to rush it.

## Tests

Use unit tests for agent parsing, precedence, diagnostics, delegate-description filtering, tool intersection, session ownership checks, and bounded progress state. Use a fake model/provider for runner tests.

Add integration tests for:

- fresh persisted child creation
- resume with prior child messages
- model and thinking inheritance
- agent model override
- abort during a tool call
- simultaneous task calls
- project trust in TUI and headless modes
- extension reload and session switch cleanup
- `/tasks` and parent navigation

Keep one manual smoke script that launches Pi against a fixture repo and records the expected session tree.

## Decisions to make before implementation

1. Should version one persist every child by default, or only when `persist: true` is set? I recommend always persisting when the parent is persisted.
2. Should project agents be available automatically in a trusted project, or require first-run confirmation? I recommend both trust checks: project trust plus one confirmation per agent per parent session.
3. Is an in-memory child acceptable when the parent uses `--no-session`? I recommend yes, with resume clearly unavailable.
4. Should child agents ever edit the same checkout concurrently? OpenCode allows it. I would allow it but make the tool description warn the parent not to assign overlapping writes. Worktree policy does not belong in this extension.

## Deliberately excluded

- workflow DSLs
- chain and fan-out parameters
- schedulers and missions
- worktree creation
- agent-authored agent definitions
- automatic reviewer loops
- nested subagents in version one
- primary-agent mode switching
- remote dashboards

These features can live in separate extensions or skills. Putting them into `delegate` would recreate the opinionated systems this extension is meant to avoid.
