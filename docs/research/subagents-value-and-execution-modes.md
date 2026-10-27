# Are subagents worth it, and do we need both execution modes?

Assessed 2026-10-16. Sources are the vendors' own docs, engineering posts, source code, and shipped tool prompts:

- Claude Code docs at [code.claude.com](https://code.claude.com/docs/en/sub-agents), plus the `Agent` tool prompt and schema shipped in `@anthropic-ai/claude-code` 2.1.301. The schema is in [the npm tarball's `sdk-tools.d.ts`](https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.301.tgz). Claude Code is closed source, so I read the prompt text with `strings` from the [linux-x64 binary](https://registry.npmjs.org/@anthropic-ai/claude-code-linux-x64/-/claude-code-linux-x64-2.1.301.tgz). That text is minified, and some passages are conditional on plan or feature flags. Treat which variant a given session sees as unverified.
- OpenAI Codex at [`openai/codex@6ae8b8aa`](https://github.com/openai/codex/tree/6ae8b8aa7c608730d4315d59c5c081897ae02780) and the [Subagents doc](https://learn.chatgpt.com/docs/agent-configuration/subagents). `developers.openai.com/codex/subagents` now redirects there.
- OpenCode 2.0.30 at [`anomalyco/opencode@37e3912d`](https://github.com/anomalyco/opencode/tree/37e3912d8ea5814593b8591bdc85f91cb69949e2). `sst/opencode` redirects to that repository. This is the v2 rewrite. The tool is now called `subagent`, not `task`. The [agents page on opencode.ai](https://opencode.ai/docs/agents) still describes v1, so I cite source over docs wherever they disagree.
- Local baseline is [`delegate`](../../dot/.pi/agent/extensions/delegate/README.md), about 2,970 lines including tests.

## Decision

**Keep subagents, but only as a foreground context-isolation and fan-out tool. Background mode is optional, and it is the part to cut if maintenance hurts.**

The vendors agree on the narrow case. A subagent pays off when a side task would flood the parent with output it won't need again, such as broad code search, test or log triage, doc lookups, or an independent review, and when several such questions can run in parallel. All three vendors also say, in docs or shipped prompts, that subagents cost extra tokens, start cold, and suit coupled or quick work badly. The only hard numbers are Anthropic's, and they come from web research, not coding.

On modes, all three products now ship background execution. Claude Code made it the default and removes foreground in interactive sessions. Codex has only background spawns plus a `wait_agent` barrier. OpenCode defaults to foreground and adds a `background` flag and Ctrl+B promotion. So background is mainstream. But nobody publishes evidence that it improves results. It buys interactivity, letting the user and parent keep talking while a child runs. Anthropic's own measured multi-agent system ran subagents synchronously. The proven benefits are isolation and parallel fan-out, and foreground calls issued in one message deliver both.

For a single-user Pi setup, the minimal useful `delegate` is one tool, fresh isolated children, `general` plus a tool-restricted `explore`, per-agent model and thinking, parallel calls, abort propagation, final-text-only return, and resumable saved child sessions. Background mode, `delegate_result`, the task widget, Ctrl+digit shortcuts, and the code that keeps jobs alive across session switches are the expensive optional layer. They account for roughly a third of the code and most of the lifecycle bugs found so far.

## Claude Code

**Invocation.** The `Agent` tool takes `description` (3 to 5 words), `prompt`, optional `subagent_type`, `model` (`sonnet|opus|haiku|fable`), `effort`, `run_in_background`, `name`, and `isolation` (`worktree|remote`) ([`sdk-tools.d.ts` `AgentInput`](https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.301.tgz)). Built-ins are `Explore` (read-only, specified thoroughness level), `Plan` (read-only, used in plan mode), `general-purpose` (all subagent tools), plus helper agents ([built-in subagents](https://code.claude.com/docs/en/sub-agents#built-in-subagents)). With fork mode on, `subagent_type: "fork"` clones the current conversation instead of starting fresh ([fork the conversation](https://code.claude.com/docs/en/sub-agents#fork-the-current-conversation)).

**Execution modes.** Foreground blocks the parent. Background runs concurrently and "reach[es] Claude as a completion notification in a later turn" ([foreground or background](https://code.claude.com/docs/en/sub-agents#run-subagents-in-foreground-or-background)). Fork mode is on by default in interactive sessions since v2.1.232. There, every Agent-spawned subagent runs in the background, and Claude Code removes the `run_in_background` parameter, so "Claude can't ask for the foreground" ([fork mode](https://code.claude.com/docs/en/sub-agents#turn-fork-mode-on-or-off)). With fork mode off, in `-p` and the SDK, Claude picks background by default and foreground "when it needs the result before continuing". Ctrl+B backgrounds a running task. `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` forces foreground. Background subagents get a smaller built-in tool set ([available tools](https://code.claude.com/docs/en/sub-agents#available-tools)). The docs also admit a real failure: "Before v2.1.211, Claude sometimes reported results for a background subagent that hadn't finished."

**Fan-out, nesting, resume.** Up to 20 concurrent subagents by default ([concurrent limit](https://code.claude.com/docs/en/sub-agents#concurrent-subagent-limit)). Nesting goes three levels deep by default. The default has moved between 5, 1, and 3 across recent releases ([nesting](https://code.claude.com/docs/en/sub-agents#let-subagents-spawn-their-own-subagents)). Resume uses `SendMessage` to an agent ID or name. The resumed subagent "retain[s] their full conversation history". Explore and Plan are one-shot and can't be resumed ([resume](https://code.claude.com/docs/en/sub-agents#resume-subagents)).

**Context.** A non-fork child gets its own system prompt, the delegation message, CLAUDE.md, a git status snapshot, and preloaded skills. It "doesn't see your conversation history". Explore and Plan skip CLAUDE.md and git status "to keep research fast and inexpensive" ([what loads at startup](https://code.claude.com/docs/en/sub-agents#what-loads-at-startup)). The parent sees "only that final result" ([Agent tool behavior](https://code.claude.com/docs/en/tools-reference#agent-tool-behavior)). Claude Code scans that result for injected instructions before the parent reads it ([output scanning](https://code.claude.com/docs/en/sub-agents#subagent-output-scanning)).

**Per-agent config.** Frontmatter supports `tools`, `disallowedTools`, `model`, `effort`, `permissionMode`, `maxTurns`, `skills`, `mcpServers`, `hooks`, `memory`, `background`, `isolation: worktree`, and more ([frontmatter fields](https://code.claude.com/docs/en/sub-agents#supported-frontmatter-fields)).

**When to use it, per the docs.** Use the main conversation when "the task needs frequent back-and-forth", when "multiple phases share significant context", for "a quick, targeted change", or when "latency matters", because a non-fork subagent "starts fresh and may need time to gather context". Use subagents when "the task produces verbose output you don't need", when you need tool restrictions, or when "the work is self-contained" ([choose between](https://code.claude.com/docs/en/sub-agents#choose-between-subagents-and-main-conversation)). The docs warn that many parallel subagents returning detailed results "can consume significant context, and each subagent spends tokens of its own" ([parallel research](https://code.claude.com/docs/en/sub-agents#run-parallel-research)).

**When to use it, per the shipped tool prompt** (2.1.301 binary):

- "For a single-fact lookup where you already know the file, symbol, or value, search directly. Once you've delegated a search, don't also run it yourself"
- "Reserve this tool for open-ended questions that span the codebase, or tasks that match an available agent type."
- "Pass `run_in_background: false` only when your very next action depends on the agent's result and nothing else could usefully happen while it runs"
- "Never fabricate or predict a pending agent's results"
- "Trust but verify: an agent's summary describes what it intended to do, not necessarily what it did."
- "**Never delegate understanding.** Don't write 'based on your findings, fix the bug'". The source uses double quotes inside the passage.
- "Forks are cheap because they share your prompt cache."
- A variant gated on a plan check reads "**Do not spawn agents unless the user asks.** Each spawn starts cold and re-derives context you already have". I infer from the minified condition that it targets the Pro plan. I could not confirm which sessions see it.
- When a second write-capable agent shares a checkout, the tool warns that "parallel agents sharing a checkout can overwrite each other's work" and suggests `isolation: "worktree"`.

## OpenAI Codex CLI

**Invocation.** The `multi_agent` feature is stable and on by default ([`features/src/lib.rs` L1471-1476](https://github.com/openai/codex/blob/6ae8b8aa7c608730d4315d59c5c081897ae02780/codex-rs/features/src/lib.rs#L1471-L1476)). V1 tools are `spawn_agent`, `send_input`, `resume_agent`, `wait_agent`, and `close_agent`. `spawn_agent` takes `message` or `items`, `agent_type`, `fork_context` (default fresh), `model`, and `reasoning_effort` ([`multi_agents_spec.rs`](https://github.com/openai/codex/blob/6ae8b8aa7c608730d4315d59c5c081897ae02780/codex-rs/core/src/tools/handlers/multi_agents_spec.rs#L70-L110), [properties](https://github.com/openai/codex/blob/6ae8b8aa7c608730d4315d59c5c081897ae02780/codex-rs/core/src/tools/handlers/multi_agents_spec.rs#L610-L650)). An opt-in `multi_agent_v2` adds task paths, `followup_task`, `send_message`, `list_agents`, and `interrupt_agent`. V2 forks full parent history by default ([v2 spec](https://github.com/openai/codex/blob/6ae8b8aa7c608730d4315d59c5c081897ae02780/codex-rs/core/src/tools/handlers/multi_agents_spec.rs#L108-L160)). Built-in roles are `default`, `explorer`, and `worker`. An `awaiter` role for long commands is commented out as "temp removed" ([`role.rs` L342-405](https://github.com/openai/codex/blob/6ae8b8aa7c608730d4315d59c5c081897ae02780/codex-rs/core/src/agent/role.rs#L342-L405)). The `explorer.toml` config file is empty, so `explorer` is a routing description with no tool restriction.

**Execution modes.** There is no foreground spawn. `spawn_agent` "Returns the spawned agent id" immediately. `wait_agent` is the barrier, with a 30 s default timeout, and its description tells the model to "Prefer longer waits (minutes) to avoid busy polling" ([wait spec](https://github.com/openai/codex/blob/6ae8b8aa7c608730d4315d59c5c081897ae02780/codex-rs/core/src/tools/handlers/multi_agents_spec.rs#L286-L300), [timeouts](https://github.com/openai/codex/blob/6ae8b8aa7c608730d4315d59c5c081897ae02780/codex-rs/core/src/tools/handlers/multi_agents_common.rs#L22-L24)). On completion, Codex injects a `<subagent_notification>` into the parent without starting a turn ([`control.rs` L573](https://github.com/openai/codex/blob/6ae8b8aa7c608730d4315d59c5c081897ae02780/codex-rs/core/src/agent/control.rs#L573), [`completion.rs` `trigger_turn: false`](https://github.com/openai/codex/blob/6ae8b8aa7c608730d4315d59c5c081897ae02780/codex-rs/core/src/agent/control/completion.rs#L112-L118)). Default limits are 6 threads and depth 1 ([`config/mod.rs` L256-266](https://github.com/openai/codex/blob/6ae8b8aa7c608730d4315d59c5c081897ae02780/codex-rs/core/src/config/mod.rs#L256-L266)). "Completed agents remain open and count toward the concurrency limit until closed" ([`close_agent`](https://github.com/openai/codex/blob/6ae8b8aa7c608730d4315d59c5c081897ae02780/codex-rs/core/src/tools/handlers/multi_agents_spec.rs#L347)).

**Context and restrictions.** V1 children start with only the initial prompt unless `fork_context` is set. All agents share one working directory: "edits made by one agent are immediately visible to all other agents" ([`multi_agent_instructions.rs` L13-17](https://github.com/openai/codex/blob/6ae8b8aa7c608730d4315d59c5c081897ae02780/codex-rs/prompts/src/multi_agent_instructions.rs#L13-L17)). Custom agents are TOML files that can set `model`, `model_reasoning_effort`, and instructions, and can disable features such as `features.shell_tool`. But "Custom agent instructions can ask an agent to avoid edits, but they don't create a separate read-only sandbox", and sandbox and approval settings always come from the parent ([docs](https://learn.chatgpt.com/docs/agent-configuration/subagents)).

**When to use it.** Codex is the most restrictive of the three. The spawn description says: "Do not spawn sub-agents unless the user or applicable AGENTS.md/skill instructions explicitly ask for sub-agents, delegation, or parallel agent work. Requests for depth, thoroughness, research, investigation, or detailed codebase analysis do not count as permission to spawn." ([L738-739](https://github.com/openai/codex/blob/6ae8b8aa7c608730d4315d59c5c081897ae02780/codex-rs/core/src/tools/handlers/multi_agents_spec.rs#L738-L739)). Other lines from the same description:

- "Do not delegate urgent blocking work when your immediate next step depends on that result." ([L744](https://github.com/openai/codex/blob/6ae8b8aa7c608730d4315d59c5c081897ae02780/codex-rs/core/src/tools/handlers/multi_agents_spec.rs#L744))
- "For code-edit subtasks, decompose work so each delegated task has a disjoint write set." ([L755](https://github.com/openai/codex/blob/6ae8b8aa7c608730d4315d59c5c081897ae02780/codex-rs/core/src/tools/handlers/multi_agents_spec.rs#L755))
- "Call wait_agent very sparingly." and "While the subagent is running in the background, do meaningful non-overlapping work immediately." ([L758-760](https://github.com/openai/codex/blob/6ae8b8aa7c608730d4315d59c5c081897ae02780/codex-rs/core/src/tools/handlers/multi_agents_spec.rs#L758-L760))
- "Run multiple independent information-seeking subtasks in parallel" ([L765](https://github.com/openai/codex/blob/6ae8b8aa7c608730d4315d59c5c081897ae02780/codex-rs/core/src/tools/handlers/multi_agents_spec.rs#L765))

Proactive delegation switches on only at `ultra` reasoning effort ([`session/multi_agents.rs` L76-108](https://github.com/openai/codex/blob/6ae8b8aa7c608730d4315d59c5c081897ae02780/codex-rs/core/src/session/multi_agents.rs#L76-L108)). The docs give the rationale as "context pollution" and "context rot". They recommend parallel agents "for read-heavy tasks such as exploration, tests, triage, and summarization" and caution that parallel writes "can create conflicts and increase coordination overhead". They also say that "subagent workflows consume more tokens than comparable single-agent runs" ([docs](https://learn.chatgpt.com/docs/agent-configuration/subagents)). I found no OpenAI measurement of benefit.

## OpenCode 2.0.30

**Invocation.** The `subagent` tool takes `agent`, `description`, `prompt`, optional `model`, `sessionID` (resume), and `background` ([`subagent.ts` L29-51](https://github.com/anomalyco/opencode/blob/37e3912d8ea5814593b8591bdc85f91cb69949e2/packages/core/src/tool/plugin/subagent.ts#L29-L51)). Built-ins are `general` (full tools, no nested subagents, no questions) and `explore`. `explore` denies everything except read, grep, glob, shell, and web, and its prompt says "Shell commands MUST be read-only" ([`plugin/agent.ts` L87-116](https://github.com/anomalyco/opencode/blob/37e3912d8ea5814593b8591bdc85f91cb69949e2/packages/core/src/plugin/agent.ts#L87-L116)). Subagents denied to the caller vanish from the tool description ([L282-305](https://github.com/anomalyco/opencode/blob/37e3912d8ea5814593b8591bdc85f91cb69949e2/packages/core/src/tool/plugin/subagent.ts#L282-L305)).

**Execution modes.** "Foreground (default) runs the subagent to completion and returns its final response." "Use background only for independent work that can run while you continue elsewhere." ([L55-62](https://github.com/anomalyco/opencode/blob/37e3912d8ea5814593b8591bdc85f91cb69949e2/packages/core/src/tool/plugin/subagent.ts#L55-L62)). A background start returns: "DO NOT sleep, poll for progress, ask the subagent for status, or duplicate this subagent's work" ([L19-27](https://github.com/anomalyco/opencode/blob/37e3912d8ea5814593b8591bdc85f91cb69949e2/packages/core/src/tool/plugin/subagent.ts#L19-L27)). There is no poll tool. Completion arrives as a synthetic `<subagent>` message in the parent ([`subagent-completion.ts`](https://github.com/anomalyco/opencode/blob/37e3912d8ea5814593b8591bdc85f91cb69949e2/packages/core/src/session/subagent-completion.ts#L21-L46)). Ctrl+B moves blocking work, including a foreground subagent, to the background ([`session.ts` L442-460](https://github.com/anomalyco/opencode/blob/37e3912d8ea5814593b8591bdc85f91cb69949e2/packages/core/src/session.ts#L442-L460), [keybind](https://github.com/anomalyco/opencode/blob/37e3912d8ea5814593b8591bdc85f91cb69949e2/packages/tui/src/config/keybind.ts#L129)). Depth defaults to 1 through `experimental.subagent_depth` ([L129](https://github.com/anomalyco/opencode/blob/37e3912d8ea5814593b8591bdc85f91cb69949e2/packages/core/src/tool/plugin/subagent.ts#L129)). Parallel fan-out means several tool calls in one response. Parent interrupt cancels a foreground child ([L234-239](https://github.com/anomalyco/opencode/blob/37e3912d8ea5814593b8591bdc85f91cb69949e2/packages/core/src/tool/plugin/subagent.ts#L234-L239)).

**Context.** A new child is a saved session with `parentID`. Its first message is "You are a subagent spawned by another session." plus the prompt. The model comes from the override, then the agent, then the parent ([L184-212](https://github.com/anomalyco/opencode/blob/37e3912d8ea5814593b8591bdc85f91cb69949e2/packages/core/src/tool/plugin/subagent.ts#L184-L212)). The tool tells the parent that "New child sessions start with fresh context, so include all relevant context".

**When to use it.** Guidance differs by model family. The GPT and GPT-Astra prompts say "Do not spawn subagents unless the user or applicable AGENTS.md/skill instructions explicitly ask" ([`gpt.txt` L31](https://github.com/anomalyco/opencode/blob/37e3912d8ea5814593b8591bdc85f91cb69949e2/packages/core/src/plugin/system-prompt/gpt.txt#L31)). The Meta prompt says to "proactively use the `subagent` tool" and to use it "to minimize context token usage whenever tool calls generate large outputs but only a small subset is useful" ([`meta.txt` L36-39](https://github.com/anomalyco/opencode/blob/37e3912d8ea5814593b8591bdc85f91cb69949e2/packages/core/src/plugin/system-prompt/meta.txt#L36-L39)). Trinity says "When doing file search, prefer to use the subagent tool in order to reduce context usage" ([`trinity.txt` L83](https://github.com/anomalyco/opencode/blob/37e3912d8ea5814593b8591bdc85f91cb69949e2/packages/core/src/plugin/system-prompt/trinity.txt#L83)). The Anthropic prompt doesn't mention subagents. OpenCode publishes no rationale or measurements.

## Anthropic's measured evidence

These are the only first-party numbers I found. They come from Anthropic's web Research feature, not from coding agents.

- A multi-agent system with an Opus 4 lead and Sonnet 4 subagents "outperformed single-agent Claude Opus 4 by 90.2% on our internal research eval". In BrowseComp analysis, "token usage by itself explains 80% of the variance" ([multi-agent research system, 2025-06-13](https://www.anthropic.com/engineering/multi-agent-research-system)).
- Cost: "agents typically use about 4× more tokens than chat interactions, and multi-agent systems use about 15× more tokens than chats."
- Limits: "domains that require all agents to share the same context or involve many dependencies between agents are not a good fit", and "most coding tasks involve fewer truly parallelizable tasks than research, and LLM agents are not yet great at coordinating and delegating to other agents in real time."
- Failure modes: early agents spawned "50 subagents for simple queries". Vague briefs made subagents duplicate each other's searches.
- Speed: parallel subagents plus parallel tool calls "cut research time by up to 90% for complex queries".
- Mode: "Currently, our lead agents execute subagents synchronously." The post calls async execution future work that "adds challenges in result coordination, state consistency, and error propagation".
- Return size: a subagent "might explore extensively, using tens of thousands of tokens or more, but returns only a condensed, distilled summary of its work (often 1,000-2,000 tokens)" ([context engineering, 2025-09-29](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)). The same post says multi-agent suits "complex research and analysis where parallel exploration pays dividends". For back-and-forth work it recommends compaction instead.
- On coding, Anthropic is openly unsure: "it's still unclear whether a single, general-purpose coding agent performs best across contexts, or if better performance can be achieved through a multi-agent architecture" ([long-running harnesses, 2025-11-26](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)).

**Unverified.** None of the three vendors publishes a measured win or loss for coding subagents specifically. Claude Code says forks "share your prompt cache" but gives no cost figure. OpenAI's docs state more tokens without numbers.

## Comparison

| | Claude Code 2.1.301 | Codex CLI | OpenCode 2.0.30 | Local `delegate` |
| --- | --- | --- | --- | --- |
| Tool | `Agent` | `spawn_agent` + `wait_agent`, `send_input`, `resume_agent`, `close_agent` | `subagent` | `delegate` + `delegate_result` |
| Built-ins | Explore, Plan, general-purpose, fork | default, worker, explorer (no restriction) | general, explore (read-only shell) | general, explore (no shell) |
| Default mode | Background; interactive cannot request foreground | Background only; `wait_agent` barrier | Foreground | Foreground |
| Background result | Notification in a later turn | Notification injected without new turn | Synthetic message | Steered into run or follow-up turn |
| Poll/result tool | None for agents ("Don't peek") | `wait_agent` | None | `delegate_result` poll/wait |
| Promote running task to background | Ctrl+B | n/a | Ctrl+B | No |
| Parallel | Multiple calls; 20 concurrent | 6 threads | Multiple calls | Multiple calls; 8 background |
| Nesting | 3 levels | Depth 1 | Depth 1 | None |
| Resume | `SendMessage` to ID or name | `send_input` / `resume_agent` | `sessionID` | `task_id` |
| Child sees parent transcript | No, except fork | V1 no unless `fork_context`; V2 yes by default | No | No |
| Per-agent model/effort | Yes | Yes | Model yes | Model and thinking |
| Per-agent tool restriction | Allow and deny lists | Feature toggles only; sandbox from parent | Permission rules | Allowlist under parent ceiling |
| Spawn policy in prompt | Delegate open-ended or parallel work; a plan-gated variant says only on request | Only on explicit request, unless effort is `ultra` | Varies by model family | Not stated |

## Assessment: where subagents help and where they hurt

The vendors agree on what works:

1. **Read-heavy work with verbose output.** Codebase exploration, test and log triage, and doc lookups, where the parent needs only a summary. Every vendor names this first.
2. **Independent questions in parallel.** Anthropic's 90.2% and the 90% time cut come from here, in research. Codex says to run "independent information-seeking subtasks in parallel".
3. **Fresh-context review or verification.** Claude Code's "independent read" and verification-subagent pattern. Codex's PR-review example splits by concern.
4. **Tool or permission restriction.** A read-only reviewer or explorer.

Where they are overhead or harmful:

- **Coupled, back-and-forth, or quick targeted work.** The child starts cold and re-derives context. Claude Code lists latency and shared context as reasons to stay in the main conversation. Anthropic says coding has fewer parallel tasks than research.
- **Blocking critical-path work.** Codex tells the model to do it locally rather than delegate and wait.
- **Parallel writes in one checkout.** Codex and Claude Code both warn about conflicts. The fixes are disjoint write sets or worktrees.
- **Token cost.** About 15× chat for multi-agent research. Every vendor says delegation spends extra tokens.
- **Lossy handoff.** Vague briefs cause duplicated or misdirected work. Summaries describe intent, not what the child did ("Trust but verify"). Delegating synthesis gives shallow results ("Never delegate understanding").

Two vendors now refuse to spawn unless asked: Codex everywhere below `ultra`, and OpenCode on GPT models. I read that as vendors who tested proactive delegation and found that it often wasted tokens. That is an inference. No published data says so.

## Assessment: is background mode worth it?

**What background buys.** The parent, and so the user, can keep working while a child runs. Claude Code's default argument is "so the user can hand you other work". It also lets long runs survive the parent's turn ending.

**What it costs.** Every vendor's prompt has to fight the same failures. Models fabricate or predict pending results. They poll, sleep, duplicate the child's work, or claim completion early. Claude Code documents shipping that bug before v2.1.211. Codex has to say "Do not repeatedly wait by reflex" and that completed agents hold slots "until closed". Locally, the same class of problem showed up. The [background-instruction research](pi-subagents-background-instructions.md) traced a parent that answered without waiting and a completion lost across session replacement.

**What the evidence supports.** The measured gains, isolation and parallel speedup, need parallel execution, not detached execution. Anthropic got them synchronously. In Pi, several foreground `delegate` calls in one response already run concurrently. Background mode is a UX preference that vendors with full-time teams have adopted. It is not a quality feature.

**Is it common?** Yes. All three ship it, and two make it the default or the only option. That would matter if Pi were trying to match a product. For a personal setup with one maintainer, it matters less than what each line costs to maintain.

## Assessment: minimal useful feature set for `delegate`

**Table stakes**, present in all three products and backed by the evidence:

- One delegation tool with `title`, `prompt`, and `subagent_type`. A fresh isolated child that returns its final text only.
- `general` and a tool-restricted `explore`. The local `explore` is stricter than any vendor's because it has no shell. That is fine, but it can't run `git log` or `rg`. OpenCode's read-only-shell rule is the common middle ground.
- Per-agent `model` and thinking, inheriting from the parent by default. All three support this, and Claude Code pitches it as cost control.
- Parallel fan-out through multiple calls in one response, with no `tasks` or `chain` parameters. This matches all three.
- Abort propagation from parent to foreground child.
- Custom Markdown agents with user and project precedence and a tool allowlist.
- No nesting by default. Codex and OpenCode both default to depth 1.

**Cheap and worth keeping:**

- `task_id` resume. All three support resume, and it costs little once child sessions are saved.
- `/tasks` navigation into child sessions. Codex has `/subagents` and OpenCode has child navigation. This is a debugging aid.
- `delegate.extensions`. It exists because the Anthropic OAuth provider hook needs it, so it is a functional requirement, not a feature choice.

**Optional layer, cut first.** This is about a third of the code. My estimate counts `background.ts`, `delivery.ts`, their tests, and the background parts of `render.ts` and `index.ts`.

- `mode: "background"` with the eight-job pool, follow-up and steer delivery, and the requirement for TUI or RPC mode.
- `delegate_result` poll and wait. Neither Claude Code nor OpenCode has an equivalent agent-result tool. Codex's `wait_agent` exists only because Codex has no foreground spawn. With foreground available, a barrier tool has no job.
- The background-task widget and detail overlay, the Ctrl+1..0 shortcuts, and `/task-cancel`.
- Keeping jobs alive across session replacement. No vendor offers this in-process. OpenCode and Claude Code tie background work to the live session or process. It is also where the local lost-completion bug came from.

**If background stays, shrink it to OpenCode's shape:** a boolean flag, one automatic completion message, no poll tool, and cancellation on session switch. Ctrl+B promotion of a running foreground child is the one background feature two vendors chose independently. It is also arguably more useful than model-chosen background, because the human decides when to stop waiting.

**Off-the-shelf fallback.** Pi 1.2.0 still ships the `examples/extensions/subagent` extension. It is foreground-only, runs subprocesses, supports parallel and chain, and has no session persistence or resume. Adopting it would cut maintenance to nearly zero, but you would lose resume, saved child sessions, and the current rendering. [pi-subagent-extension-replacement.md](pi-subagent-extension-replacement.md) covers third-party replacements.
