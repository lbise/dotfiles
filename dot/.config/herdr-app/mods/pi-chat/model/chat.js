// One chat, end to end: from "exec printed this" to the turns to draw.
//
//   const chat = createChat();
//   const argv = chatPollArgv(chat, terminalId);
//   const { stdout } = await exec(argv[0], argv.slice(1), { on: machine });
//   chatReceive(chat, stdout);        // then draw chat.turns and chat.state

import { advance, createCursor, parsePoll, pollArgv } from "./protocol.js";
import { mergeLive } from "./live.js";
import { appendLines, createTranscript } from "./transcript.js";

/**
 * @typedef {object} Chat
 * @property {import("./protocol.js").Cursor} cursor
 * @property {import("./transcript.js").Transcript} transcript
 * @property {import("./protocol.js").State|null} state The last state.json read, or null when there is none.
 * @property {import("./protocol.js").Poll["problem"]} problem Why `state` is missing or old.
 * @property {import("./transcript.js").Turn[]} turns The rows: transcript and live state merged.
 * @property {boolean} live Pi is working or asking.
 * @property {boolean} truncated The file's start was skipped: earlier history is not loaded.
 */

/** @returns {Chat} */
export function createChat() {
  return { cursor: createCursor(), transcript: createTranscript(), state: null, problem: "missing", turns: [], live: false, truncated: false };
}

/**
 * The argv of this chat's next poll.
 * @param {Chat} chat
 * @param {string} terminalId
 */
export function chatPollArgv(chat, terminalId) {
  return pollArgv(terminalId, chat.cursor);
}

/**
 * Takes one poll's stdout and updates the chat in place.
 * @param {Chat} chat
 * @param {string} stdout
 * @returns {Chat}
 */
export function chatReceive(chat, stdout) {
  const poll = parsePoll(stdout);
  const read = advance(chat.cursor, poll);
  if (read.reset) chat.transcript = createTranscript(poll.state && poll.state.cwd);
  appendLines(chat.transcript, read.lines);
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
