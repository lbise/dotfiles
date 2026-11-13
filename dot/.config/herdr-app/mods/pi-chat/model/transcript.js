// Pi's session file (JSONL, see Pi's docs/session-format.md) as a list of turns.
//
// Lines are fed as they arrive. Each one is parsed once and reduced to the little
// the chat shows (no image data, no thinking, tool output cut short); a line that
// continues the active branch is folded into the last turn, and only a line that
// starts or switches a branch makes the turns be rebuilt from the kept entries.

import { clip, fileChange, stepKind, stepLabel } from "./tools.js";

/**
 * @typedef {object} ImageRef An image of a user message, without its data.
 * @property {string} entryId The session entry that holds it.
 * @property {number} index Its place in that message's `content` array.
 * @property {string} mimeType
 * @property {number} bytes Approximate size of the decoded image.
 *
 * @typedef {object} UserMessage
 * @property {string} text
 * @property {string|null} skill Name of the skill the message invoked (`/skill:name`); `text` is then what followed it.
 * @property {ImageRef[]} images
 *
 * @typedef {object} ChangedFile
 * @property {string} path
 * @property {number} added Lines added.
 * @property {number} removed Lines removed.
 *
 * @typedef {object} Step One tool call.
 * @property {string} id The tool call id: the same in state.json and in the session file.
 * @property {import("./tools.js").StepKind} kind
 * @property {string} name The tool's name.
 * @property {string} label One line, at most 200 characters.
 * @property {boolean} [ok] Absent while the tool runs; false when it failed or never finished.
 * @property {number} [durationMs] When known.
 * @property {number} [startedAt] Epoch ms on the agent's machine; only on a step still running.
 * @property {string} result The tool's text output, at most 2000 characters.
 * @property {ChangedFile} [change] What an edit or write call changes.
 *
 * @typedef {object} Narration Assistant text written before the turn's last tool call.
 * @property {string} key
 * @property {string} text Markdown.
 * @property {number} beforeStep Index in `steps` of the step it precedes.
 *
 * @typedef {object} Note Something that is neither the user nor the assistant.
 * @property {string} key
 * @property {"compaction"|"branch"|"custom"|"bash"} kind Context compacted (text: the summary), summary of a branch left behind, a message shown by an extension, a command the user ran with `!`.
 * @property {string} title The extension's `customType`, or the command; else "".
 * @property {string} text At most 2000 characters.
 * @property {number} beforeStep Index in `steps` of the step it precedes.
 *
 * @typedef {object} Turn From one user message to the next.
 * @property {string} key Stable for the life of the turn; use it as the list key.
 * @property {UserMessage|null} user Null when the turn was not opened by the user: an extension's message, or history that starts mid-turn.
 * @property {Step[]} steps
 * @property {Narration[]} narration
 * @property {Note[]} notes
 * @property {string} answer The assistant's text after the last tool call, as markdown.
 * @property {ChangedFile[]} files Files changed by the edit and write calls that succeeded.
 * @property {number|null} startedAt Epoch ms on the agent's machine.
 * @property {number|null} endedAt Null while the turn is live.
 * @property {number|null} durationMs
 * @property {{ provider: string, id: string }|null} model The model that wrote the last reply.
 * @property {string|null} error Set when the turn ended in an error.
 * @property {boolean} aborted
 * @property {boolean} done The assistant's last message ended its reply (it asked for no tool).
 * @property {boolean} [live] The turn is running now. Set by mergeLive.
 * @property {boolean} [thinking] The model is thinking. Set by mergeLive.
 *
 * @typedef {{ type: "step", key: string, step: Step } | { type: "text", key: string, text: string } | { type: "note", key: string, note: Note }} TrailRow
 *
 * @typedef {object} Transcript
 * @property {{ id: string, cwd: string, parentSession: string|null }|null} header
 * @property {string|null} cwd Paths inside it are shown relative to it.
 * @property {Turn[]} turns The active branch. Read only: appendLines changes it in place.
 * @property {number} rev Goes up whenever `turns` changed.
 * @property {number} skipped Lines that were not session entries.
 * @property {Map<string, { step: Step, turn: Turn }>} steps The active branch's steps by id.
 * @property {Map<string, Entry>} entries Internal: every entry read, on any branch.
 * @property {string|null} leaf Internal: the last entry in the file, which is the tip of the active branch.
 * @property {Turn|null} current Internal: the turn that takes what comes next.
 * @property {Step[]} unresolved Internal: steps of the last assistant message that have no result yet.
 * @property {Array<{ key: string, text: string }>} pending Internal: assistant text that is the answer unless a tool call follows.
 * @property {Map<string, string>} keys Internal: entry id to turn key, where the key is not the entry id.
 * @property {string|null} reserved Internal: the key promised to the next turn (see mergeLive).
 *
 * @typedef {object} Entry One line of the file, reduced to what the chat keeps.
 * @property {string} id
 * @property {string|null} parentId
 * @property {number|null} at When it was written, epoch ms.
 * @property {"skip"|"user"|"assistant"|"result"|"note"} kind
 * @property {UserMessage} [user]
 * @property {Array<{ key: string, text: string } | { call: Omit<Step, "result"> }>} [parts] Assistant: text and tool calls, in order.
 * @property {string} [stop] Assistant: the stop reason.
 * @property {string|null} [error] Assistant.
 * @property {Turn["model"]} [model] Assistant.
 * @property {string} [callId] Result.
 * @property {boolean} [ok] Result.
 * @property {number} [durationMs] Result.
 * @property {Note["kind"]} [note] Note.
 * @property {string} [title] Note.
 * @property {boolean} [hidden] Note: the extension asked for it not to be shown.
 * @property {string} [text] Result and note.
 */

const TEXT_MAX = 2000;
const SKILL = /^<skill name="([^"]+)" location="[^"]+">\n[\s\S]*?\n<\/skill>(?:\n\n([\s\S]+))?$/;

/**
 * @param {string|null} [cwd] Pi's working directory, in case the file's first line (which names it) is not read.
 * @returns {Transcript}
 */
export function createTranscript(cwd) {
  return {
    header: null,
    cwd: cwd || null,
    turns: [],
    rev: 0,
    skipped: 0,
    steps: new Map(),
    entries: new Map(),
    leaf: null,
    current: null,
    unresolved: [],
    pending: [],
    keys: new Map(),
    reserved: null,
  };
}

/**
 * Feeds complete lines of the session file, in file order.
 * @param {Transcript} transcript
 * @param {string[]} lines
 */
export function appendLines(transcript, lines) {
  let changed = false;
  for (const line of lines) {
    if (!line) continue;
    let raw;
    try {
      raw = JSON.parse(line);
    } catch {
      raw = null;
    }
    if (raw && raw.type === "session") {
      transcript.header = { id: raw.id, cwd: raw.cwd, parentSession: raw.parentSession || null };
      if (typeof raw.cwd === "string") transcript.cwd = raw.cwd;
      continue;
    }
    if (!raw || typeof raw.id !== "string" || typeof raw.type !== "string") {
      transcript.skipped++;
      continue;
    }
    if (transcript.entries.has(raw.id)) continue; // fed twice
    const entry = reduce(raw, transcript.cwd);
    const continues = transcript.leaf === null || entry.parentId === transcript.leaf;
    transcript.entries.set(entry.id, entry);
    transcript.leaf = entry.id;
    if (continues) fold(transcript, entry);
    else rebuild(transcript);
    changed = true;
  }
  if (changed) transcript.rev++;
}

/**
 * A turn's steps, narration and notes in the order they happened, for the opened
 * view. Use `key` as the list key.
 * @param {Turn} turn
 * @returns {TrailRow[]}
 */
export function trail(turn) {
  /** @type {TrailRow[]} */
  const rows = [];
  let n = 0;
  let t = 0;
  for (let i = 0; i <= turn.steps.length; i++) {
    // Notes first: narration is set down together with the tool call it precedes,
    // so a note recorded at the same place came before that message.
    for (; n < turn.notes.length && turn.notes[n].beforeStep <= i; n++) {
      rows.push({ type: "note", key: turn.notes[n].key, note: turn.notes[n] });
    }
    for (; t < turn.narration.length && turn.narration[t].beforeStep <= i; t++) {
      rows.push({ type: "text", key: turn.narration[t].key, text: turn.narration[t].text });
    }
    if (i < turn.steps.length) rows.push({ type: "step", key: turn.steps[i].id, step: turn.steps[i] });
  }
  return rows;
}

/**
 * An empty turn.
 * @param {string} key
 * @param {UserMessage|null} user
 * @returns {Turn}
 */
export function newTurn(key, user) {
  return {
    key,
    user,
    steps: [],
    narration: [],
    notes: [],
    answer: "",
    files: [],
    startedAt: null,
    endedAt: null,
    durationMs: null,
    model: null,
    error: null,
    aborted: false,
    done: false,
  };
}

// ---- one line of the file, reduced to what the chat keeps ----

/**
 * @param {any} raw A parsed line.
 * @param {string|null} cwd
 * @returns {Entry}
 */
function reduce(raw, cwd) {
  /** @type {Entry} */
  const entry = { id: raw.id, parentId: typeof raw.parentId === "string" ? raw.parentId : null, at: null, kind: "skip" };
  const message = raw.type === "message" && raw.message && typeof raw.message === "object" ? raw.message : null;
  // The entry's time is when it was written; a message's own time is when it began.
  const at = Date.parse(raw.timestamp);
  entry.at = Number.isFinite(at) ? at : message && Number.isFinite(message.timestamp) ? message.timestamp : null;

  if (message) reduceMessage(entry, message, cwd);
  else if (raw.type === "compaction") note(entry, "compaction", "", raw.summary);
  else if (raw.type === "branch_summary") note(entry, "branch", "", raw.summary);
  else if (raw.type === "custom_message") {
    note(entry, "custom", String(raw.customType || ""), blocksText(raw.content));
    entry.hidden = raw.display !== true;
  }
  // The rest (model and thinking changes, labels, usage, extension state, context
  // edits, session info) shows nowhere in the conversation, but stays a tree node.
  return entry;
}

/**
 * @param {Entry} entry
 * @param {Note["kind"]} kind
 * @param {string} title
 * @param {unknown} text
 */
function note(entry, kind, title, text) {
  entry.kind = "note";
  entry.note = kind;
  entry.title = clip(title, 200);
  entry.text = clip(typeof text === "string" ? text : "", TEXT_MAX);
}

/**
 * @param {Entry} entry
 * @param {any} message Pi's AgentMessage.
 * @param {string|null} cwd
 */
function reduceMessage(entry, message, cwd) {
  const content = Array.isArray(message.content) ? message.content : [];
  if (message.role === "user") {
    entry.kind = "user";
    const text = blocksText(message.content, Infinity, "");
    // Pi expands "/skill:name rest" into the skill's whole body followed by the rest.
    const skill = SKILL.exec(text);
    entry.user = { text: skill ? (skill[2] || "").trim() : text, skill: skill ? skill[1] : null, images: [] };
    content.forEach((/** @type {any} */ block, /** @type {number} */ index) => {
      if (!block || block.type !== "image") return;
      const data = typeof block.data === "string" ? block.data.length : 0;
      entry.user.images.push({ entryId: entry.id, index, mimeType: String(block.mimeType || ""), bytes: Math.floor((data * 3) / 4) });
    });
  } else if (message.role === "assistant") {
    entry.kind = "assistant";
    entry.stop = message.stopReason;
    entry.error = message.stopReason === "error" ? clip(String(message.errorMessage || "error"), TEXT_MAX) : null;
    entry.model = typeof message.model === "string" ? { provider: String(message.provider || ""), id: message.model } : null;
    entry.parts = [];
    content.forEach((/** @type {any} */ block, /** @type {number} */ index) => {
      if (!block) return;
      if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
        entry.parts.push({ key: `${entry.id}:${index}`, text: block.text.trim() });
      } else if (block.type === "toolCall" && typeof block.id === "string") {
        const name = String(block.name || "");
        /** @type {Omit<Step, "result">} */
        const call = { id: block.id, kind: stepKind(name), name, label: stepLabel(name, block.arguments, cwd) };
        const change = fileChange(name, block.arguments, cwd);
        if (change) call.change = change;
        entry.parts.push({ call });
      }
    });
  } else if (message.role === "toolResult") {
    entry.kind = "result";
    entry.callId = message.toolCallId;
    entry.ok = message.isError !== true;
    entry.durationMs = Number.isFinite(message.durationMs) ? message.durationMs : undefined;
    entry.text = clip(blocksText(content, TEXT_MAX), TEXT_MAX);
  } else if (message.role === "bashExecution") {
    note(entry, "bash", String(message.command || ""), message.output);
  }
  // System messages carry the prompt and the tools: not conversation.
}

/**
 * The text of a content value (a string, or blocks), each image shown as `image`.
 * Stops joining once `enough` characters are in hand.
 * @param {any} content
 */
function blocksText(content, enough = Infinity, image = "[image]") {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts = [];
  let length = 0;
  for (const block of content) {
    if (length > enough) break;
    const text = !block ? "" : block.type === "text" && typeof block.text === "string" ? block.text : block.type === "image" ? image : "";
    if (!text) continue;
    parts.push(text);
    length += text.length + 1;
  }
  return parts.join("\n");
}

// ---- entries of the active branch, folded into turns ----

/** @param {Transcript} transcript */
function rebuild(transcript) {
  const path = [];
  const seen = new Set();
  // Walk up from the tip; a parent that was never read (history cut by a first
  // read of the file's tail) ends the walk like a root does.
  for (let entry = transcript.entries.get(transcript.leaf); entry && !seen.has(entry.id); entry = transcript.entries.get(entry.parentId)) {
    seen.add(entry.id);
    path.push(entry);
  }
  transcript.turns = [];
  transcript.steps = new Map();
  transcript.current = null;
  transcript.unresolved = [];
  transcript.pending = [];
  // A key promised to the next turn is for a new entry, which only the tip can be.
  const reserved = transcript.reserved;
  transcript.reserved = null;
  for (let i = path.length - 1; i > 0; i--) fold(transcript, path[i]);
  transcript.reserved = reserved;
  if (path.length) fold(transcript, path[0]);
}

/**
 * @param {Transcript} transcript
 * @param {Entry} entry The entry that opens the turn.
 * @param {UserMessage|null} user
 */
function open(transcript, entry, user) {
  settle(transcript);
  let key = transcript.keys.get(entry.id);
  if (!key && transcript.reserved) {
    key = transcript.reserved;
    transcript.keys.set(entry.id, key);
    transcript.reserved = null;
  }
  const turn = newTurn(key || entry.id, user);
  transcript.turns.push(turn);
  transcript.current = turn;
  transcript.pending = [];
  return turn;
}

/**
 * Steps that got no result before the conversation moved on never finished.
 * @param {Transcript} transcript
 */
function settle(transcript) {
  for (const step of transcript.unresolved) if (step.ok === undefined) step.ok = false;
  transcript.unresolved = [];
}

/**
 * @param {Turn} turn
 * @param {number|null} at
 */
function touch(turn, at) {
  if (at === null) return;
  if (turn.startedAt === null) turn.startedAt = at;
  turn.endedAt = turn.endedAt === null ? at : Math.max(turn.endedAt, at);
  turn.durationMs = turn.endedAt - turn.startedAt;
}

/**
 * @param {Transcript} transcript
 * @param {Entry} entry
 */
function fold(transcript, entry) {
  if (entry.kind === "skip") return;
  if (entry.kind === "result") return foldResult(transcript, entry);
  let turn = transcript.current;
  if (entry.kind === "user") {
    turn = open(transcript, entry, entry.user);
  } else if (entry.kind === "note") {
    // After a finished reply, an extension's message starts something new: it does
    // not turn the answer already given into narration.
    if (turn && turn.done) turn = transcript.current = null;
    if (entry.hidden) return;
    if (!turn) turn = open(transcript, entry, null);
    turn.notes.push({ key: entry.id, kind: entry.note, title: entry.title, text: entry.text, beforeStep: turn.steps.length });
  } else {
    if (!turn) turn = open(transcript, entry, null);
    foldAssistant(transcript, turn, entry);
  }
  touch(turn, entry.at);
}

/**
 * @param {Transcript} transcript
 * @param {Turn} turn
 * @param {Entry} entry
 */
function foldAssistant(transcript, turn, entry) {
  settle(transcript);
  // What a failed reply had written so far is replaced by the retry.
  if (turn.error !== null) transcript.pending = [];
  const failed = entry.stop === "error" || entry.stop === "aborted";
  for (const part of entry.parts) {
    if (!("call" in part)) {
      transcript.pending.push(part);
      continue;
    }
    for (const text of transcript.pending) turn.narration.push({ key: text.key, text: text.text, beforeStep: turn.steps.length });
    transcript.pending = [];
    const step = { ...part.call, result: "" };
    // A call in a message that was cut short never ran.
    if (failed) step.ok = false;
    else transcript.unresolved.push(step);
    turn.steps.push(step);
    transcript.steps.set(step.id, { step, turn });
  }
  turn.answer = transcript.pending.map((text) => text.text).join("\n\n");
  if (entry.model) turn.model = entry.model;
  turn.error = entry.error;
  turn.aborted = entry.stop === "aborted";
  turn.done = entry.stop !== "toolUse";
}

/**
 * @param {Transcript} transcript
 * @param {Entry} entry
 */
function foldResult(transcript, entry) {
  const found = transcript.steps.get(entry.callId);
  if (!found) return;
  const { step, turn } = found;
  const counted = step.ok === true;
  step.ok = entry.ok;
  step.result = entry.text;
  if (entry.durationMs !== undefined) step.durationMs = entry.durationMs;
  if (step.change && entry.ok && !counted) {
    let file = turn.files.find((known) => known.path === step.change.path);
    if (!file) turn.files.push((file = { path: step.change.path, added: 0, removed: 0 }));
    file.added += step.change.added;
    file.removed += step.change.removed;
  }
  touch(turn, entry.at);
}
