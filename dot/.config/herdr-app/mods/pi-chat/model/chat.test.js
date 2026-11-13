import assert from "node:assert/strict";
import { test } from "node:test";
import { chatPollArgv, chatReceive, createChat } from "./chat.js";
import { call, session, text } from "./fixture.js";

const RS = "\x1e";
const state = (fields) => JSON.stringify({ v: 1, status: "idle", sessionFile: "/s/one.jsonl", turn: null, stream: null, ...fields });
// What the poll command prints for a file holding `lines`, read from line `from`.
function stdout(stateText, path, lines, from = 0) {
  const bytes = (part) => Buffer.byteLength(part.map((line) => line + "\n").join(""));
  return `${stateText}${RS}${bytes(lines.slice(0, from))} ${bytes(lines)} ${path}\n${lines.slice(from).map((line) => line + "\n").join("")}${RS}`;
}

test("a chat follows a session from poll to poll", () => {
  const chat = createChat();
  assert.deepEqual(chatPollArgv(chat, "t7").slice(3), ["herdr-chat", "t7", "", "0"]);

  const s = session();
  const user = s.user("héllo");
  chatReceive(chat, stdout(state({ status: "working" }), "/s/one.jsonl", s.lines));
  assert.deepEqual([chat.turns.length, chat.live, chat.turns[0].live, chat.state.status], [1, true, true, "working"]);
  assert.deepEqual(chatPollArgv(chat, "t7").slice(5), ["/s/one.jsonl", String(Buffer.byteLength(s.lines.join("\n")) + 1)]);

  const read = s.lines.length;
  s.assistant([text("hello")]);
  chatReceive(chat, stdout(state({}), "/s/one.jsonl", s.lines, read));
  assert.deepEqual([chat.turns.length, chat.turns[0].key, chat.turns[0].answer, chat.live], [1, user, "hello", false]);
  assert.equal(chat.turns, chat.transcript.turns);
});

test("a first read that skips the file's start takes the working directory from the state", () => {
  const chat = createChat();
  const s = session();
  s.user("early");
  const skipped = s.lines.length;
  s.assistant([call("c1", "read", { path: "/home/u/rom/src/a.c" })], "toolUse");
  chatReceive(chat, stdout(state({ cwd: "/home/u/rom" }), "/s/one.jsonl", s.lines, skipped));
  assert.equal(chat.truncated, true);
  assert.deepEqual([chat.turns[0].user, chat.turns[0].steps[0].label], [null, "src/a.c"]);
});

test("a session restarted from scratch replaces the conversation", () => {
  const chat = createChat();
  const old = session();
  old.user("old question");
  old.assistant([text("old answer"), call("c1", "ls", {})], "toolUse");
  chatReceive(chat, stdout(state({}), "/s/one.jsonl", old.lines));
  assert.equal(chat.turns.length, 1);

  // /new: the state names a file that does not exist until the first message.
  chatReceive(chat, `${state({ sessionFile: "/s/two.jsonl" })}${RS}\n${RS}`);
  assert.deepEqual(chat.turns, []);
  assert.deepEqual(chatPollArgv(chat, "t7").slice(5), ["/s/two.jsonl", "0"]);

  const fresh = session();
  fresh.user("new question");
  chatReceive(chat, stdout(state({ sessionFile: "/s/two.jsonl" }), "/s/two.jsonl", fresh.lines));
  assert.deepEqual(chat.turns.map((turn) => turn.user.text), ["new question"]);

  // The same path rewritten shorter: the command starts over, and so does the chat.
  const again = session();
  again.user("rewritten");
  chatReceive(chat, stdout(state({ sessionFile: "/s/two.jsonl" }), "/s/two.jsonl", again.lines.slice(1)));
  assert.deepEqual(chat.turns.map((turn) => turn.user.text), ["rewritten"]);
});

test("an unreadable state keeps the last good one; a missing one clears it", () => {
  const chat = createChat();
  const s = session();
  s.user("hi");
  chatReceive(chat, stdout(state({ title: "Greeting" }), "/s/one.jsonl", s.lines));
  chatReceive(chat, `{"v":1,"tit${RS}\n${RS}`);
  assert.deepEqual([chat.state.title, chat.problem, chat.turns.length], ["Greeting", "garbled", 1]);
  chatReceive(chat, `${RS}\n${RS}`);
  assert.deepEqual([chat.state, chat.problem, chat.turns.length], [null, "missing", 1]);
  chatReceive(chat, "");
  assert.equal(chat.turns.length, 1);
});
