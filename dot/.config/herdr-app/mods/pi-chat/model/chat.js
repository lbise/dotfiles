// One chat, end to end: from "exec printed this" to the turns to draw.
//
//   const chat = createChat();
//   const argv = chatPollArgv(chat, terminalId);
//   const { stdout } = await exec(argv[0], argv.slice(1), { on: machine });
//   chatReceive(chat, stdout);        // then draw chat.turns and chat.state

import { advance, createCursor, parsePoll, pollArgv } from "./protocol.js";
import { mergeLive } from "./live.js";
import { appendLines, createTranscript, moveLeaf } from "./transcript.js";

/**
 * @typedef {object} Chat
 * @property {import("./protocol.js").Cursor} cursor
 * @property {import("./transcript.js").Transcript} transcript
 * @property {import("./protocol.js").State|null} state The last state.json read, or null when there is none.
 * @property {import("./protocol.js").Poll["problem"]} problem Why `state` is missing or old.
 * @property {import("./transcript.js").Turn[]} turns The rows: transcript and live state merged.
 * @property {boolean} live Pi is working or asking.
 * @property {boolean} truncated The file's start was skipped: earlier history is not loaded.
 * @property {number} epoch Goes up when the conversation is another one: another session, or another branch of it.
 * @property {string|null} file A subagent's session file this chat follows instead of Pi's own; `state` is still Pi's.
 */

/**
 * @param {string|null} [file] Follow this subagent session file (check it with isChildSession first).
 * @returns {Chat}
 */
export function createChat(file = null) {
  return { cursor: createCursor(), transcript: createTranscript(), state: null, problem: "missing", turns: [], live: false, truncated: false, epoch: 0, file };
}

/**
 * The subagent of a chat that follows one, as Pi's state lists it while it runs; else null.
 * @param {Chat} chat
 */
export function childTask(chat) {
  const tasks = chat.file && chat.state && Array.isArray(chat.state.tasks) ? chat.state.tasks : [];
  return tasks.find((task) => task && task.sessionPath === chat.file) || null;
}

/**
 * The argv of this chat's next poll.
 * @param {Chat} chat
 * @param {string} terminalId
 */
export function chatPollArgv(chat, terminalId) {
  return pollArgv(terminalId, chat.cursor, chat.file);
}

/**
 * Takes one poll's stdout and updates the chat in place.
 * @param {Chat} chat
 * @param {string} stdout
 * @returns {Chat}
 */
export function chatReceive(chat, stdout) {
  const poll = parsePoll(stdout);
  if (chat.file) return childReceive(chat, poll);
  const read = advance(chat.cursor, poll);
  const rebuilds = chat.transcript.rebuilds;
  if (read.reset) chat.transcript = createTranscript(poll.state && poll.state.cwd);
  appendLines(chat.transcript, read.lines);
  // A tree move adds no entry: Pi's leaf says where the branch ends. Unless the
  // file holds an entry written after this state (it was read a moment earlier).
  const leaf = poll.state ? poll.state.leaf : undefined;
  const transcript = chat.transcript;
  if (leaf !== undefined && leaf !== transcript.leaf && !(transcript.lastAt > poll.state.updated)) moveLeaf(transcript, leaf);
  if (read.reset || transcript.rebuilds !== rebuilds) chat.epoch++;
  chat.cursor = read.cursor;
  // state.json is replaced atomically; should one read still be unusable, the
  // state from the poll before is closer to the truth than none.
  if (poll.state || poll.problem === "missing") chat.state = poll.state;
  chat.problem = poll.problem;
  const view = mergeLive(chat.transcript, chat.state);
  chat.turns = view.turns;
  chat.live = view.live;
  chat.truncated = read.cursor.truncated;
  return chat;
}

/**
 * A subagent's chat: its own file, no live merge (state.json describes Pi, not the
 * subagent). While Pi lists it as running, its last turn is live.
 * @param {Chat} chat
 * @param {import("./protocol.js").Poll} poll
 */
function childReceive(chat, poll) {
  if (poll.state || poll.problem === "missing") chat.state = poll.state;
  chat.problem = poll.problem;
  if (poll.file && poll.file.path === chat.file) {
    const read = advance(chat.cursor, poll);
    if (read.reset) {
      chat.transcript = createTranscript(chat.state && chat.state.cwd);
      chat.epoch++;
    }
    appendLines(chat.transcript, read.lines);
    chat.cursor = read.cursor;
    chat.truncated = read.cursor.truncated;
  }
  const turns = chat.transcript.turns;
  const last = turns[turns.length - 1];
  chat.live = Boolean(childTask(chat));
  // Running: its open steps still run. Ended: one the file never saw finish was cut off.
  const merged = !last ? null : chat.live ? { ...last, live: true, endedAt: null } : mergeLive(chat.transcript, null).turns[turns.length - 1];
  chat.turns = merged && merged !== last ? turns.slice(0, -1).concat([merged]) : turns;
  return chat;
}
