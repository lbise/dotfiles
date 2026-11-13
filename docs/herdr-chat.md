# Herdr chat for Pi

A chat view for Pi agents in the Herdr desktop app. Two halves that share one file protocol:

- **Pi extension** `dot/.pi/agent/extensions/herdr-chat/`: runs inside Pi on the agent's machine,
  publishes live state and takes commands.
- **Herdr mod** `dot/.config/herdr-app/mods/pi-chat/`: runs in the app on Windows, draws the chat.

The app treats every agent as remote (`1-wsl` and three ssh machines). The mod never reads local
files for agent data: everything goes through `exec(cmd, args, { on: machine })` on the agent's machine.
A round trip takes about 0.2 s.

The design contract is `.impeccable/surfaces/dot-config-herdr-app-mods-pi-chat.md`; the visual
reference is `.impeccable/mocks/herdr-chat-preview.html` (open it in a browser).

## File protocol (version 1)

State directory, on the agent's machine, one per herdr-core terminal:

    ${XDG_STATE_HOME:-$HOME/.local/state}/herdr-chat/<HC_TERMINAL_ID>/

The mod derives it from the terminal address (`1-wsl/t7` is machine `1-wsl`, id `t7`).

The extension is active only when all hold: `HC_TERMINAL_ID` is set, the process was not started by
another Pi, and the session has a UI (`ctx.hasUI`). Otherwise it writes nothing and registers no tool.
In a herdr-core terminal it always registers its internal command (see session commands below).

"Started by another Pi" means `PI_CODING_AGENT=true` in the environment the process was started with,
read from `/proc/self/environ`. `process.env` cannot tell, because Pi sets the variable in its own
environment before it loads extensions. Without `/proc` (not Linux) the check passes. Delegate children
run inside the parent's process and do not load this extension; the parent shows a delegate as one step.

The files stay behind when Pi exits: `pid` tells a live Pi from a stale file.

### `state.json` (extension writes, mod reads)

Rewritten atomically (temp file + rename), at most every 150 ms while something changes. Nothing is
written while nothing changes, so `updated` is the time of the last change, not a heartbeat. What no
Pi event announces (a typed draft, entries from other extensions) is picked up within a second.

```jsonc
{
  "v": 1,
  "pid": 1965,                    // the Pi process; the mod compares it with the terminal's foreground pid
  "updated": 1794489190038,       // ms
  "sessionFile": "/home/u/.pi/agent/sessions/--x--/…jsonl",  // null for an ephemeral session
  "sessionId": "01a1…",
  "title": "AFH minimum channel check",   // session name when Pi has one, else null
  "cwd": "/home/u/andromeda/rom",
  "status": "idle",               // "idle" | "working" | "asking" | "compacting"
  "entries": 57,                  // counter, +1 whenever the session file gained an entry
  "leaf": "e9f…",                 // id of the current entry (the end of the active branch), null in an empty session; changes on a tree move that adds no entry
  "model": { "provider": "azure-foundry", "id": "claude-fable-5-2", "name": "claude-fable-5-2" },  // null when none is selected
  "thinking": "high",
  "models": [ { "provider": "…", "id": "…", "name": "…" } ],   // what the picker offers and `cycle` steps through: the scope (the chat's last `scope`, else Pi's `enabledModels`), or every model with credentials when there is no scope
  "thinkingLevels": ["off", "minimal", "low", "medium", "high", "xhigh"],  // the levels the current model supports
  "context": { "tokens": 113089, "window": 1000000 },          // each null when unknown (tokens: right after a compaction)
  "cost": 1.42,                   // session cost in USD as Pi's built-in footer counts it (messages, compactions, branch summaries), null when unknown
  "git": { "root": "rom", "branch": "dmtx-audit-fixes" },       // null outside a repository
  "usage": [ { "key": "usage-primary", "text": "󰅐 ███░░░░░ 38%", "label": "5h", "percent": 38, "resets": "2h 10m" } ],  // the footer's texts without ANSI, in footer order
  "turn": {                       // the turn running now, or the last finished one; null before the first since Pi started or reloaded
    "startedAt": 1794489000000, "endedAt": null,
    "steps": [ { "id": "toolu_…", "kind": "look", "name": "read", "label": "src/a.c", "startedAt": 1, "endedAt": 2, "ok": true } ]
  },
  "stream": { "text": "The check belongs in…", "thinking": false },  // assistant message being written, else null; thinking: the model is reasoning right now
  "ask": { "id": "a1", "question": "Which accent?", "options": [ { "label": "Lime", "description": "…" } ], "multi": false },  // else null
  "draft": "",                    // text in Pi's input box
  "error": null                   // last extension error as a short string, for the mod to show; null again once a later inbox command succeeds
}
```

A turn is one agent run, from a prompt until Pi is idle again (`agent_start` to `agent_settled`): it
spans every model call and tool call the prompt caused. A tree move ends the shown turn (`turn`
becomes `null`). `status` is `asking` while `ask` is set, else `compacting` while a compaction
(manual or automatic) or the branch summary of an inbox `tree` command runs.

A step is one tool call of the transcript; `id` is its tool call id there (some providers make it
several hundred characters long). Calls a tool makes itself (codemode scripts) are not steps.
Step `kind`: `look` (read, grep, find, ls, tools named like fetch or search), `run` (bash, powershell,
codemode), `edit` (edit, write), `other` (anything else, delegates and `ask_user` included). While a
step runs `endedAt` is `null` and `ok` is absent; `ok` is `false` when the tool failed or the run was
stopped before it ended. `label` is one short line: the path (relative to `cwd` when inside it),
pattern or command, at most 200 characters, empty when the call has none.

`usage` texts are what the `usage` extension shows in the footer, glyphs included: a Nerd Font icon
(private-use code points) and a bar of block characters. Draw them in the terminal font, or take the
figures out of them. Keys in order: `usage-primary`, `usage-primary-reset`, `usage-secondary`,
`usage-secondary-reset`, `usage-extra`; a key is missing when the provider has no such value.

Entries also carry, when the provider reports them, figures taken from the usage data (not parsed
from the text): `label` names what the entry measures, `percent` (0 to 100, one decimal) is the
share of the window used, `resets` the time left as short text (`"2h 10m"`, `"45m"`, `"3d"`,
`"now"`). `usage-primary` and `usage-secondary` carry all three, their `-reset` keys `label` and
`resets`, `usage-extra` only `label`. `usage-primary` and `usage-secondary` also carry, when there are any,
`detail` (used/limit, `"10.8k/40k"`), `note` (what the footer prints after it: Copilot's month-end
projection `"→27.8k"`, an overage `"+12 overage"`), and `tone`/`noteTone` (`"warning"` from 70 %,
`"error"` from 90 % or on overage; absent when calm). The usage extension refetches every minute while
idle and resends `resets` as it counts down, every 30 s. `session` also takes `"action": "reload"`, as
`/reload`. Labels: `"5h"` (or the window's length in hours or days),
`"Week"`, `"Month"`, `"Cap"` (Copilot usage against `usage.copilotCreditCap`), `"Extra"` (Claude
extra usage), `"Credits"` (Codex credits), `"Prompt"` (Copilot's estimate for the running prompt),
`"Total"` (Azure Foundry, all time). A primary entry that is a plain summary (`"active"`, Azure's
month total without budget) has at most a `label`.

`ask` comes from the `ask_user` tool this extension gives the model. The same question is open as a
select prompt in Pi's TUI; the first answer wins and closes the other. A description is absent when
the model gave none.

### `commands.json` (extension writes once per session start and on reload)

```jsonc
{ "v": 1, "commands": [ { "name": "skill:tdd", "description": "…", "kind": "skill" } ] }  // kind: "skill" | "prompt" | "command"
```

The list is `pi.getCommands()`: skills, prompt templates and the slash commands of extensions
(`command`). `name` has no leading slash; `description` is `""` when there is none. Pi's built-in
commands (`/new`, `/compact`, `/model`, ...) are not listed: Pi does not expose them to extensions and
a `prompt` cannot run them; `/new`, `/compact`, `/resume` and `/tree` are the inbox's `session`
commands. To run a listed one, send `{ "type": "prompt", "text": "/skill:tdd …" }`.

### `inbox/` (mod writes, extension reads)

One JSON file per command, named `<epoch ms>-<random>.json`, written as a temp file and renamed.
The temp name must not end in `.json`: only `*.json` files that do not start with a dot are read.
The extension handles files in name order, deletes each one before running it, and deletes files
older than 60 s unread. Age is the file's modification time on the agent's machine, so the clock that
made the name does not matter. A command that cannot run sets `state.error`.

```jsonc
{ "type": "prompt", "text": "…", "images": ["/abs/path.png"] }   // send as the user; while working it steers. Slash commands, skills and templates in text run as if typed. Images: png, jpg, jpeg, gif, webp files on the agent's machine
{ "type": "abort" }
{ "type": "model", "provider": "…", "id": "…" }
{ "type": "thinking", "level": "low" }
{ "type": "cycle", "what": "model", "direction": "backward" }   // as Ctrl+P (forward, the default) / Shift+Ctrl+P over `models`; "what": "thinking" as Shift+Tab over `thinkingLevels`
{ "type": "scope", "models": [ { "provider": "…", "id": "…" } ] } // the models Ctrl+P cycles through, saved as `enabledModels` in Pi's global settings; none or all is no scope
{ "type": "answer", "id": "a1", "value": ["Lime"] }               // labels chosen, or free text as one string; ignored when id is not the pending ask
{ "type": "draft", "text": "…" }                                  // set Pi's input box
{ "type": "session", "action": "new" }                          // like /new
{ "type": "session", "action": "reload" }                       // like /reload
{ "type": "session", "action": "compact", "instructions": "…" }  // like /compact [instructions]; instructions optional
{ "type": "session", "action": "resume", "path": "/abs/….jsonl" } // like /resume, picking that session
{ "type": "session", "action": "tree", "entryId": "…", "summarize": false }  // like /tree, jumping to that entry
{ "type": "list", "what": "sessions" }                           // write sessions.json
{ "type": "list", "what": "tree" }                               // write tree.json
{ "type": "list", "what": "models" }                             // write models.json
```

Session commands do what Pi's built-in command of the same name does, with Pi's own messages in
its TUI. Pi only allows session control (new, resume, tree) from a command handler, so the
extension registers its own command, `/herdr-chat-internal-session` (not in `commands.json`; typed
by hand it does nothing), and runs it the way `/usage-refresh` runs from a `prompt`: an extension
command runs before Pi records anything, so it never reaches the conversation, the session file or
the model. `compact` needs no command and calls Pi's compaction directly. A session command that
arrives while Pi is working or compacting is refused with `state.error`; so are a `resume` path
that is not an existing `.jsonl` file and a `tree` entry that does not exist. Failures Pi reports
(`Nothing to compact (session too small)`, a switch an extension cancelled) also end up in
`state.error`. `tree` to the current entry does nothing; `tree` to a user message, as in `/tree`,
moves to its parent and puts its text in Pi's input box (`draft`). After `new`, `resume` (and
Pi's own `/fork`, `/clone`, `/reload`) Pi restarts the extension: `state.json` and
`commands.json` are rewritten for the new session at once, `turn` is `null`, and `usage` follows
when the usage extension reports again. Commands still in the same inbox scan after a `new` or
`resume` are dropped.

### `sessions.json` (extension writes on a `list` request)

```jsonc
{ "v": 1, "at": 1794489190038, "items": [
  { "path": "/home/u/.pi/agent/sessions/--x--/….jsonl", "title": "AFH minimum channel check",  // title: session name, else first user message, one line, at most 200 characters
    "cwd": "/home/u/andromeda/rom", "modified": 1794489000000, "messages": 42, "current": false } ] }
```

The sessions Pi's `/resume` offers for the current folder (`SessionManager.list`), newest first
(last message time), at most 50. `messages` counts every message entry; `current` marks the open
session, which is listed only once Pi has written its file (with the first user message).

### `tree.json` (extension writes on a `list` request)

```jsonc
{ "v": 1, "at": 1794489190038, "leaf": "e9f…", "items": [
  { "id": "a1b…", "parentId": null, "role": "user", "text": "one line, at most 200 characters",
    "timestamp": 1794489000000, "active": true, "label": null } ] }
```

The entries Pi's `/tree` lets you jump to in its default view, in its order: depth first, the
active branch first among siblings. Hidden as in `/tree`: settings entries (model, thinking level,
labels, title, custom data) and assistant messages that only call tools (unless failed or the
current entry). `parentId` is the nearest listed ancestor, `active` marks the current branch (root
to `leaf`), `label` is the user's label for the entry, `timestamp` is in ms. `role` is the
message's role (`user`, `assistant`, `toolResult`, `bashExecution`, `system`, …) or, for other
entries, their type (`compaction`, `branch_summary`, `custom_message`). `text`: the message text;
for a tool result the tool and its step label (`read src/a.c`); `(aborted)` or the error for a
failed assistant message; `113k tokens` for a compaction; the summary for a branch summary; empty
when there is none.

### `models.json` (extension writes on a `list` request)

```jsonc
{ "v": 1, "at": 1794489190038, "items": [ { "provider": "openai", "id": "gpt-6", "name": "GPT 6", "scoped": true, "current": false } ] }
```

Every model with credentials. `scoped` marks the scope (all false when there is none), `current` the model in use.

Pi resolves its scope once, at startup, and gives extensions no way to change it. A `scope` command
therefore changes what the chat offers and cycles through at once (for every session of this Pi
process) and saves `enabledModels`, but Pi's own Ctrl+P in its terminal keeps the startup scope
until Pi restarts.

### Transcript

The conversation itself is Pi's session file (`state.sessionFile`, JSONL; see Pi's
`docs/session-format.md`). The mod reads it by byte offset and re-reads when `entries` changes.
Pi creates the file with the first user message; until then `sessionFile` names a file that does not
exist yet while `entries` already counts the model and thinking entries Pi holds in memory. Entries
are appended synchronously, so the file has an entry by the time `entries` counts it.
The file holds every branch: the conversation is the path from `state.leaf` back to the root
through `parentId`. A tree move without summary or label adds no entry; only `leaf` changes.

## The mod

One `exec` per poll returns `state.json`, a record separator, and the session file from the last
offset. Poll about every 250 ms while `status` is not `idle` and the chat is visible, every 2 s
when idle, never when hidden.

- Colours come from `theme()`. Cells use the theme's terminal colours: `ansi4` look, `ansi5` run,
  `ansi3` edit, `ansi1` failed, `ansi2` added lines.
- Prose in the UI font, figures in Geist Mono, code in the terminal font (`settings().font_family`).
- Chat settings (accent, ground, tool activity, reading width) live in `shared()` state; accent and
  ground are written to `settings.json` as `colors` overrides.

## Development

`scripts/herdr-app-dev` drives a second Herdr window with its own home
(`%USERPROFILE%\.config\herdr-app-dev`), so the daily window, its layout and its theme stay untouched:

    scripts/herdr-app-dev sync          # copy the mod, layouts and themes from the repo
    scripts/herdr-app-dev check 'C:\Users\<you>\.config\herdr-app-dev\mods\pi-chat'
    scripts/herdr-app-dev do layout.switch '{"name":"leo"}'
    scripts/herdr-app-dev shot name     # prints the PNG's WSL path

Spaces, tabs and terminals belong to herdr-core, so a tab made from the dev window also appears in
the daily window.
