# pi-chat model

The data layer of the Pi chat mod: from the string `exec` returns to the rows to draw.
No UI, no imports from outside this folder, plain ES2020 (no Node, `Buffer`,
`TextEncoder`, `btoa` or timers). The protocol is `docs/herdr-chat.md`.

Tests: `node --test` in this folder. `fixture.js` is a test helper.

## Use

```js
import { chatPollArgv, chatReceive, createChat } from "./model/chat.js";
import { inboxArgvs, splitAddress } from "./model/protocol.js";

const { machine, id } = splitAddress("1-wsl/t7");
const chat = createChat();                      // one per terminal

// every poll
const argv = chatPollArgv(chat, id);
const out = await exec(argv[0], argv.slice(1), { on: machine });
if (out.code === 0) chatReceive(chat, out.stdout);
// draw chat.turns; chat.state is state.json (title, status, ask, context, usage…)

// send a command; stop at the first command that fails
for (const argv of inboxArgvs(id, { type: "prompt", text })) {
  if ((await exec(argv[0], argv.slice(1), { on: machine })).code !== 0) break;
}
```

## Exports

| Module | Export | What it does |
| --- | --- | --- |
| `chat.js` | `createChat()` | A chat: cursor, transcript, last state, merged `turns`, `live`, `truncated`. |
| | `chatPollArgv(chat, terminalId)` | The argv of the chat's next poll. |
| | `chatReceive(chat, stdout)` | Takes a poll's stdout, updates the chat in place, returns it. |
| `protocol.js` | `splitAddress(address)` | `"1-wsl/t7"` to `{ machine, id }`. |
| | `createCursor()` | `{ sessionFile, offset, truncated }`: where the next poll resumes. |
| | `pollArgv(terminalId, cursor)` | One `sh -c` that prints state.json, a separator, and the session file from the offset. |
| | `parsePoll(stdout)` | `{ state, problem, file, chunk, complete }`. Never throws. |
| | `advance(cursor, poll)` | `{ cursor, lines, reset }`: the complete lines read and the new byte offset. |
| | `inboxArgvs(terminalId, command)` | The commands that drop one file into `inbox/` (one, or several for a long prompt). |
| | `utf8Length`, `utf8Bytes`, `base64` | Hand-written, for the engine that has none. |
| `transcript.js` | `createTranscript(cwd?)` | An empty transcript. |
| | `appendLines(transcript, lines)` | Feeds session-file lines; `transcript.turns` is the active branch. |
| | `trail(turn)` | The turn's steps, narration and notes in order, for the opened view. |
| | `newTurn(key, user)` | An empty turn. |
| `live.js` | `mergeLive(transcript, state)` | `{ turns, live }`: the transcript plus what state.json knows of the running turn. |
| | `isLive(state)` | True while `status` is `working` or `asking`. |
| `tools.js` | `stepKind(name)`, `stepLabel(name, args, cwd?)` | A tool call's kind and one-line label, as the Pi extension gives them. |
| | `fileChange(name, args, cwd?)` | Lines an edit or write call adds and removes. |
| | `shortPath(path, cwd)` | A path inside `cwd` as relative to it. |
| | `clip(text, max)` | Cuts text, ending in an ellipsis. |
| `format.js` | `formatTokens`, `formatDuration`, `formatCost` | `113k`, `1M`; `18s`, `2m 14s`; `$1.42`. |
| | `contextCells({ tokens, window })` | 40 entries: a category (`"used"`) for a filled cell, `null` for an empty one. |
| | `usageCells("5h 38%")` | `{ label: "5h", percent: 38, detail: "", cells: boolean[10] }`. |
| `settings.js` | `chatSettings(stored)` | Valid `{ accent, ground, activity, width }`; bad fields take their default. |
| | `parseAccent(value)` | A preset's name or `#rrggbb` to `"#RRGGBB"`, else `null`. |
| | `ACCENTS`, `GROUNDS`, `ACTIVITIES`, `WIDTHS`, `DEFAULT_SETTINGS` | What the settings may be. |

The JSDoc typedefs are in `transcript.js` (`Turn`, `Step`, `Narration`, `Note`,
`UserMessage`, `ImageRef`, `ChangedFile`), `protocol.js` (`State`, `Poll`, `Cursor`),
`chat.js` (`Chat`) and `settings.js` (`ChatSettings`).

## A turn

A turn starts at a user message and runs to the next one.

```js
{
  key: "a1b2c3d4",              // stable list key
  user: {                       // null when the user did not open the turn (see below)
    text: "Where is the minimum checked?",
    skill: null,                // "tdd" when the message was /skill:tdd …; text is then the rest
    images: [{ entryId: "a1b2c3d4", index: 1, mimeType: "image/png", bytes: 48211 }],
  },
  steps: [                      // one per tool call, in order
    { id: "toolu_1", kind: "look", name: "read", label: "src/afh.c", ok: true, durationMs: 40, result: "…" },
    { id: "toolu_2", kind: "edit", name: "edit", label: "src/afh.c", ok: true, result: "…",
      change: { path: "src/afh.c", added: 3, removed: 1 } },
    { id: "toolu_3", kind: "run", name: "bash", label: "make test", result: "", startedAt: 1794489000000 },
  ],
  narration: [{ key: "b2c3d4e5:0", text: "Looking.", beforeStep: 0 }],
  notes: [],                    // { key, kind: "compaction"|"branch"|"custom"|"bash", title, text, beforeStep }
  answer: "The check is in `afh.c`.",     // markdown; while live, the reply being written
  files: [{ path: "src/afh.c", added: 3, removed: 1 }],
  startedAt: 1794489000000, endedAt: 1794489134000, durationMs: 134000,
  model: { provider: "anthropic", id: "claude-sonnet-4-5" },
  error: null, aborted: false,
  done: true,                   // the assistant's last message ended its reply
  live: true, thinking: false,  // only on the running turn, from mergeLive
}
```

- `step.ok` is absent while the step runs, `false` when the tool failed or never
  finished. `result` is at most 2000 characters, `label` at most 200.
- `narration` and `notes` say where they go with `beforeStep` (an index in `steps`;
  `steps.length` means after the last step). `trail(turn)` interleaves them.
- `user` is `null` for a turn opened by something else: an extension's message that
  made Pi answer (the message is `notes[0]` when it is shown), a compaction or `!command`
  between two turns (a turn with only a note), or history that starts mid-turn.
- `files` counts only calls that succeeded. A `write` counts all its lines as added.
- Paths in `label` and `files` are relative to Pi's working directory when inside it.

## To know

- Times are epoch ms on the agent's machine. For a running clock use `state.updated`
  as "now", not this machine's clock; a live turn's `durationMs` is as of `state.updated`.
- `transcript.turns` is changed in place; `transcript.rev` goes up when it changed.
  `chat.turns` is that same array when Pi is idle, a new array with a merged last
  turn while it is live.
- The whole active branch is shown. A compaction does not hide what came before it:
  it leaves a `compaction` note.
- A first read takes the last 2 MB of the session file (`chat.truncated` is then true):
  the list can start mid-conversation, with a first turn whose `user` is `null`.
- An image is a reference: `entryId` is the session entry's `id`, `index` its place in
  that message's `content`. The data stays in the session file.
- `inboxArgvs` needs `base64` on the agent's machine.
- Call `chatReceive` only with the stdout of a poll that exited 0: empty output reads
  as "no state file".
