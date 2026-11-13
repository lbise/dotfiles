import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { advance, base64, createCursor, inboxArgvs, isChildSession, listArgv, parsePoll, pollArgv, readArgv, splitAddress, utf8Bytes, utf8Length } from "./protocol.js";

const RS = "\x1e";

// A state directory on this machine, and the commands run for real with sh.
function machine(t) {
  const home = mkdtempSync(join(tmpdir(), "pi-chat-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const dir = join(home, "herdr-chat", "t7");
  mkdirSync(dir, { recursive: true });
  const m = {
    dir,
    session: join(home, "session.jsonl"),
    /** Like the app's exec: argv in, stdout as a string out. */
    exec(argv) {
      const run = spawnSync(argv[0], argv.slice(1), { encoding: "utf8", env: { ...process.env, XDG_STATE_HOME: home }, maxBuffer: 64 << 20 });
      return { code: run.status, stdout: run.stdout, stderr: run.stderr };
    },
    state(fields, pretty) {
      writeFileSync(join(dir, "state.json"), JSON.stringify({ v: 1, status: "idle", sessionFile: m.session, ...fields }, null, pretty));
    },
    cursor: createCursor(),
    /** One poll: returns the lines read and whether the reader started over. */
    poll() {
      const out = m.exec(pollArgv("t7", m.cursor));
      assert.equal(out.code, 0, out.stderr);
      const poll = parsePoll(out.stdout);
      const read = advance(m.cursor, poll);
      m.cursor = read.cursor;
      return { ...read, poll };
    },
  };
  return m;
}

test("utf8Length and base64 agree with Node", () => {
  for (const sample of ["", "a", "ab", "abc", "héllo", "日本語", "😀 ok", "a\ud800b", "\udc00", "ÿ".repeat(1001)]) {
    assert.equal(utf8Length(sample), Buffer.byteLength(sample), JSON.stringify(sample));
    assert.deepEqual(utf8Bytes(sample), [...Buffer.from(sample)], JSON.stringify(sample));
    assert.equal(base64(utf8Bytes(sample)), Buffer.from(sample).toString("base64"), JSON.stringify(sample));
  }
});

test("splitAddress", () => {
  assert.deepEqual(splitAddress("1-wsl/t7"), { machine: "1-wsl", id: "t7" });
  assert.deepEqual(splitAddress("t7"), { machine: null, id: "t7" });
});

test("a terminal id that is not a plain name is refused", () => {
  for (const bad of ["../x", "a/b", "", ".", "..", "a b", "$(x)"]) {
    assert.throws(() => pollArgv(bad), /bad terminal id/, bad);
    assert.throws(() => inboxArgvs(bad, { type: "abort" }), /bad terminal id/, bad);
  }
});

test("the commands are single lines", () => {
  assert.ok(!pollArgv("t7")[2].includes("\n"));
  assert.ok(!inboxArgvs("t7", { type: "abort" })[0][2].includes("\n"));
});

test("parsePoll tolerates empty and garbled output", () => {
  assert.deepEqual(parsePoll(""), { state: null, problem: "missing", file: null, chunk: "", complete: false });
  assert.deepEqual(parsePoll(undefined), { state: null, problem: "missing", file: null, chunk: "", complete: false });
  assert.deepEqual(parsePoll(`${RS}\n${RS}`), { state: null, problem: "missing", file: null, chunk: "", complete: true });
  assert.equal(parsePoll(`{"v":1,"sta${RS}\n${RS}`).problem, "garbled");
  assert.equal(parsePoll(`[1]${RS}\n${RS}`).problem, "garbled");
  assert.equal(parsePoll(`null${RS}\n${RS}`).problem, "garbled");
  assert.equal(parsePoll(`{"v":2}${RS}\n${RS}`).problem, "version");
});

test("parsePoll splits state, file and chunk", () => {
  const poll = parsePoll(`{"v":1,"status":"idle"}${RS}12 40 /tmp/a b.jsonl\n{"id":"x"}\n{"id":${RS}`);
  assert.deepEqual(poll.state, { v: 1, status: "idle" });
  assert.equal(poll.problem, null);
  assert.deepEqual(poll.file, { start: 12, size: 40, path: "/tmp/a b.jsonl" });
  assert.equal(poll.chunk, '{"id":"x"}\n{"id":');
  assert.equal(poll.complete, true);
  // Output cut short: what arrived is still used.
  const cut = parsePoll(`{"v":1}${RS}0 40 /tmp/a.jsonl\n{"id":"x"}\n{"id`);
  assert.equal(cut.complete, false);
  assert.equal(cut.chunk, '{"id":"x"}\n{"id');
});

test("no state file yet", (t) => {
  const m = machine(t);
  const read = m.poll();
  assert.equal(read.poll.state, null);
  assert.equal(read.poll.problem, "missing");
  assert.equal(read.poll.complete, true);
  assert.deepEqual([read.lines, read.reset], [[], false]);
});

test("state without a session file, then with one that does not exist yet", (t) => {
  const m = machine(t);
  m.state({ sessionFile: null });
  let read = m.poll();
  assert.equal(read.poll.state.status, "idle");
  assert.deepEqual([read.poll.file, read.lines, read.reset], [null, [], false]);

  m.state({});
  read = m.poll();
  assert.equal(read.reset, true); // a session was named: whatever was shown is not it
  assert.deepEqual(m.cursor, { sessionFile: m.session, offset: 0, truncated: false });
  assert.equal(m.poll().reset, false);

  writeFileSync(m.session, '{"id":"a"}\n');
  read = m.poll();
  assert.deepEqual([read.lines, read.reset], [['{"id":"a"}'], false]);
});

test("reads from the offset, in bytes, with multi-byte text on both sides of it", (t) => {
  const m = machine(t);
  m.state({}, 2); // pretty-printed state.json is read as well
  const lines = ['{"id":"a","t":"héllo wörld"}', '{"id":"b","t":"日本語 😀"}', '{"id":"c","t":"ÿ€𝄞"}'];
  writeFileSync(m.session, lines[0] + "\n");
  let read = m.poll();
  assert.deepEqual(read.lines, [lines[0]]);
  assert.equal(m.cursor.offset, Buffer.byteLength(lines[0]) + 1);

  appendFileSync(m.session, lines[1] + "\n" + lines[2] + "\n");
  read = m.poll();
  assert.deepEqual([read.lines, read.reset], [[lines[1], lines[2]], false]);
  assert.equal(m.cursor.offset, readFileSync(m.session).length);

  read = m.poll();
  assert.deepEqual([read.lines, read.reset], [[], false]);
});

test("a partial last line waits for the next poll, even when cut inside a character", (t) => {
  const m = machine(t);
  m.state({});
  const second = Buffer.from('{"id":"b","t":"日本語"}\n');
  const cut = second.indexOf(Buffer.from("本")) + 1; // one byte into a three-byte character
  writeFileSync(m.session, Buffer.concat([Buffer.from('{"id":"a"}\n'), second.subarray(0, cut)]));
  let read = m.poll();
  assert.deepEqual(read.lines, ['{"id":"a"}']);
  assert.equal(m.cursor.offset, 11);
  assert.deepEqual(m.poll().lines, []);
  assert.equal(m.cursor.offset, 11);

  appendFileSync(m.session, second.subarray(cut));
  read = m.poll();
  assert.deepEqual([read.lines, read.reset], [['{"id":"b","t":"日本語"}'], false]);
  assert.equal(m.cursor.offset, readFileSync(m.session).length);
});

test("another session file starts over", (t) => {
  const m = machine(t);
  m.state({});
  writeFileSync(m.session, '{"id":"a"}\n{"id":"b"}\n');
  m.poll();
  const other = m.session + ".2";
  writeFileSync(other, '{"id":"z"}\n');
  m.state({ sessionFile: other });
  const read = m.poll();
  assert.deepEqual([read.lines, read.reset], [['{"id":"z"}'], true]);
  assert.deepEqual(m.cursor, { sessionFile: other, offset: 11, truncated: false });
});

test("a file shorter than the offset starts over", (t) => {
  const m = machine(t);
  m.state({});
  writeFileSync(m.session, '{"id":"a"}\n{"id":"b"}\n');
  m.poll();
  writeFileSync(m.session, '{"id":"n"}\n');
  const read = m.poll();
  assert.deepEqual([read.lines, read.reset], [['{"id":"n"}'], true]);
});

test("an offset that is not at a line start starts over", (t) => {
  const m = machine(t);
  m.state({});
  writeFileSync(m.session, '{"id":"a"}\n{"id":"b"}\n');
  m.cursor = { sessionFile: m.session, offset: 5, truncated: false };
  const read = m.poll();
  assert.deepEqual([read.lines, read.reset], [['{"id":"a"}', '{"id":"b"}'], true]);
});

test("a first read of a large file takes the last 2 MB from a line start", (t) => {
  const m = machine(t);
  m.state({});
  const line = (i) => `{"id":"e${i}","t":"${"é".repeat(500)}"}`;
  const all = [];
  for (let i = 0; i < 3000; i++) all.push(line(i)); // about 3 MB
  writeFileSync(m.session, all.join("\n") + "\n");
  const size = readFileSync(m.session).length;

  const read = m.poll();
  assert.equal(read.reset, true);
  assert.equal(m.cursor.truncated, true);
  assert.equal(m.cursor.offset, size);
  assert.ok(read.poll.file.start >= size - 2097152 && read.poll.file.start < size - 2097152 + 1100);
  assert.deepEqual(read.lines, all.slice(-read.lines.length)); // whole lines only
  assert.ok(read.lines.length > 1900 && read.lines.length < 2100);

  appendFileSync(m.session, line("next") + "\n");
  const next = m.poll();
  assert.deepEqual([next.lines, next.reset], [[line("next")], false]);
  assert.equal(m.cursor.truncated, true);
});

test("an inbox command is written whole and renamed into place", (t) => {
  const m = machine(t);
  const command = { type: "prompt", text: 'héllo "wörld" 日本語 😀\n$HOME `x`', images: ["/abs/path.png"] };
  const argvs = inboxArgvs("t7", command, { now: 1794489190038, random: 0.5 });
  assert.equal(argvs.length, 1);
  assert.equal(m.exec(argvs[0]).code, 0);
  assert.deepEqual(readdirSync(join(m.dir, "inbox")), ["1794489190038-i00000.json"]);
  assert.deepEqual(JSON.parse(readFileSync(join(m.dir, "inbox", "1794489190038-i00000.json"), "utf8")), command);
  assert.deepEqual(readdirSync(m.dir), ["inbox"]); // nothing left beside it
});

test("a large inbox command goes in several commands and appears only with the last", (t) => {
  const m = machine(t);
  const command = { type: "prompt", text: "log line é\n".repeat(4000) };
  const argvs = inboxArgvs("t7", command);
  assert.ok(argvs.length > 2);
  for (const argv of argvs) assert.ok(argv.join(" ").length < 16000);
  argvs.forEach((argv, i) => {
    assert.equal(m.exec(argv).code, 0);
    assert.equal(readdirSync(join(m.dir, "inbox")).length, i === argvs.length - 1 ? 1 : 0);
  });
  const [name] = readdirSync(join(m.dir, "inbox"));
  assert.match(name, /^\d{13}-[0-9a-z]{6}\.json$/);
  assert.deepEqual(JSON.parse(readFileSync(join(m.dir, "inbox", name), "utf8")), command);
  assert.deepEqual(readdirSync(m.dir), ["inbox"]);
});

test("an inbox command without a type is refused", () => {
  assert.throws(() => inboxArgvs("t7", { text: "x" }), /type/);
  assert.throws(() => inboxArgvs("t7", null), /type/);
});

test("a list request drops its command and prints the file once Pi rewrote it", (t) => {
  const m = machine(t);
  writeFileSync(join(m.dir, "sessions.json"), '{"v":1,"at":1,"items":[]}');
  // Pi: answers the command in inbox/ a moment later.
  const pi = spawn("sh", ["-c", `for i in 1 2 3 4 5 6 7 8 9 10; do sleep 0.1; if ls "${m.dir}/inbox/"*.json >/dev/null 2>&1; then rm "${m.dir}/inbox/"*.json; printf '{"v":1,"at":2,"items":[]}' >"${m.dir}/sessions.json"; exit; fi; done`]);
  t.after(() => pi.kill());
  const out = m.exec(listArgv("t7", "sessions"));
  assert.equal(out.code, 0, out.stderr);
  assert.equal(out.stdout, '{"v":1,"at":2,"items":[]}');
});

test("a list request that Pi never answers exits 3, its command left in inbox/", (t) => {
  const m = machine(t);
  const argv = listArgv("t7", "tree", { now: 1794489190038, random: 0.5 });
  const out = m.exec(argv);
  assert.equal(out.code, 3);
  assert.deepEqual(JSON.parse(readFileSync(join(m.dir, "inbox", "1794489190038-i00000.json"), "utf8")), { type: "list", what: "tree" });
  assert.deepEqual(readdirSync(m.dir), ["inbox"]);
  assert.throws(() => listArgv("t7", "other"), /no such list/);
});

test("a state file is read by name", (t) => {
  const m = machine(t);
  writeFileSync(join(m.dir, "commands.json"), '{"v":1,"commands":[]}');
  assert.equal(m.exec(readArgv("t7", "commands.json")).stdout, '{"v":1,"commands":[]}');
  assert.throws(() => readArgv("t7", "../x.json"), /bad state file/);
});

test("a poll can read a subagent's session file instead of Pi's own", (t) => {
  const m = machine(t);
  const child = join(m.dir, "..", "..", "child.jsonl");
  writeFileSync(m.session, '{"type":"session"}\n');
  writeFileSync(child, '{"type":"session","id":"child"}\n');
  m.state({});
  const out = m.exec(pollArgv("t7", createCursor(), child));
  assert.equal(out.code, 0, out.stderr);
  const poll = parsePoll(out.stdout);
  assert.equal(poll.state.sessionFile, m.session);
  assert.equal(poll.file.path, child);
  assert.equal(poll.chunk, '{"type":"session","id":"child"}\n');
});

test("only an absolute .jsonl path is passed to the poll", () => {
  for (const bad of ["child.jsonl", "/s/child.txt", "/s/../etc/x.jsonl", "/s/a\nb.jsonl", 3]) {
    assert.throws(() => pollArgv("t7", createCursor(), bad), /bad session file/);
  }
});

test("a subagent session must sit beside Pi's own", () => {
  const state = { sessionFile: "/home/u/.pi/agent/sessions/--rom--/parent.jsonl" };
  assert.equal(isChildSession(state, "/home/u/.pi/agent/sessions/--rom--/child.jsonl"), true);
  assert.equal(isChildSession(state, state.sessionFile), false);
  assert.equal(isChildSession(state, "/home/u/.pi/agent/sessions/--other--/child.jsonl"), false);
  assert.equal(isChildSession(state, "/home/u/.pi/agent/sessions/--rom--/../--rom--/child.jsonl"), false);
  assert.equal(isChildSession(state, "/etc/passwd"), false);
  assert.equal(isChildSession({ sessionFile: null }, "/a/child.jsonl"), false);
  assert.equal(isChildSession(null, "/a/child.jsonl"), false);
});
