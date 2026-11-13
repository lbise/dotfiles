import assert from "node:assert/strict";
import { test } from "node:test";
import { call, session, text } from "./fixture.js";
import { appendLines, createTranscript, trail } from "./transcript.js";

function read(lines) {
  const transcript = createTranscript();
  appendLines(transcript, lines);
  return transcript;
}

test("a turn with no tools is a user message and an answer", () => {
  const s = session();
  const first = s.user("What is AFH?");
  s.assistant([{ type: "thinking", thinking: "hm" }, text("Adaptive **frequency** hopping.")], "stop", {}, 18000);
  const t = read(s.lines);

  assert.deepEqual(t.header, { id: "session-1", cwd: "/work", parentSession: null });
  assert.equal(t.turns.length, 1);
  assert.deepEqual(t.turns[0], {
    key: first,
    user: { text: "What is AFH?", skill: null, images: [] },
    steps: [],
    narration: [],
    notes: [],
    answer: "Adaptive **frequency** hopping.",
    files: [],
    startedAt: Date.parse("2026-01-01T10:00:01.000Z"),
    endedAt: Date.parse("2026-01-01T10:00:19.000Z"),
    durationMs: 18000,
    model: { provider: "anthropic", id: "claude-test" },
    error: null,
    aborted: false,
    done: true,
  });
});

test("steps, narration before the last tool call, and the answer after it", () => {
  const s = session();
  s.user("Where is the minimum checked?");
  s.assistant([text("Looking."), call("c1", "grep", { pattern: "afh_min", path: "src" }), call("c2", "read", { path: "src/afh.c" })], "toolUse");
  s.result("c1", "grep", "src/afh.c:12", { durationMs: 40 });
  s.result("c2", "read", "x".repeat(5000));
  s.assistant([text("Found it, running the tests."), call("c3", "bash", { command: "make test" })], "toolUse");
  s.result("c3", "bash", "ok", { durationMs: 2100 });
  s.assistant([text("The check is in `afh.c`."), text("It holds.")], "stop");
  const [turn] = read(s.lines).turns;

  assert.deepEqual(
    turn.steps.map((step) => [step.id, step.kind, step.name, step.label, step.ok, step.durationMs]),
    [
      ["c1", "look", "grep", "afh_min", true, 40],
      ["c2", "look", "read", "src/afh.c", true, undefined],
      ["c3", "run", "bash", "make test", true, 2100],
    ]
  );
  assert.equal(turn.steps[0].result, "src/afh.c:12");
  assert.equal(turn.steps[1].result.length, 2000);
  assert.ok(turn.steps[1].result.endsWith("…"));
  assert.deepEqual(
    turn.narration.map((n) => [n.text, n.beforeStep]),
    [
      ["Looking.", 0],
      ["Found it, running the tests.", 2],
    ]
  );
  assert.equal(turn.answer, "The check is in `afh.c`.\n\nIt holds.");
  assert.equal(turn.done, true);
  assert.equal(turn.durationMs, 6000);
  assert.deepEqual(
    trail(turn).map((row) => (row.type === "step" ? row.step.id : row.text)),
    ["Looking.", "c1", "c2", "Found it, running the tests.", "c3"]
  );
  assert.equal(new Set(trail(turn).map((row) => row.key)).size, 5);
});

test("a turn starts at each user message", () => {
  const s = session();
  const a = s.user("one");
  s.assistant([text("1")]);
  const b = s.user("two");
  s.assistant([call("c1", "ls", { path: "." })], "toolUse");
  const t = read(s.lines);
  assert.deepEqual(t.turns.map((turn) => turn.key), [a, b]);
  assert.deepEqual(t.turns.map((turn) => turn.done), [true, false]);
  assert.equal(t.turns[1].steps[0].ok, undefined); // still running
  assert.equal(t.turns[1].answer, "");
});

test("a failed tool is a step that is not ok, and changes no file", () => {
  const s = session();
  s.user("fix it");
  s.assistant(
    [
      call("c1", "edit", { path: "a.c", edits: [{ oldText: "x", newText: "y\nz" }] }),
      call("c2", "edit", { path: "b.c", edits: [{ oldText: "nope", newText: "yes" }] }),
      call("c3", "write", { path: "new.c", content: "1\n2\n3\n" }),
    ],
    "toolUse"
  );
  s.result("c1", "edit", "done");
  s.result("c2", "edit", "Could not find the text", { isError: true });
  s.result("c3", "write", "done");
  // The same file by its full path: the session's cwd is /work.
  s.assistant([call("c4", "edit", { path: "/work/a.c", edits: [{ oldText: "p\nq", newText: "p" }] })], "toolUse");
  s.result("c4", "edit", "done");
  s.assistant([text("Fixed.")]);
  const [turn] = read(s.lines).turns;

  assert.deepEqual(turn.steps.map((step) => step.ok), [true, false, true, true]);
  assert.equal(turn.steps[3].label, "a.c");
  assert.equal(turn.steps[1].result, "Could not find the text");
  assert.deepEqual(turn.steps[1].change, { path: "b.c", added: 1, removed: 1 });
  assert.deepEqual(turn.files, [
    { path: "a.c", added: 2, removed: 2 },
    { path: "new.c", added: 3, removed: 0 },
  ]);
});

test("an aborted turn", () => {
  const s = session();
  s.user("do a lot");
  s.assistant([call("c1", "bash", { command: "sleep 100" })], "toolUse");
  s.result("c1", "bash", "Command aborted", { isError: true });
  s.assistant([text("I was")], "aborted", { errorMessage: "Request was aborted" });
  const [turn] = read(s.lines).turns;
  assert.deepEqual([turn.aborted, turn.error, turn.done], [true, null, true]);
  assert.equal(turn.steps[0].ok, false);
  assert.equal(turn.answer, "I was");
});

test("a tool call in a message that was cut short never ran", () => {
  const s = session();
  s.user("go");
  s.assistant([call("c1", "write", { path: "a.c", content: "half" })], "aborted");
  const [turn] = read(s.lines).turns;
  assert.equal(turn.steps[0].ok, false);
  assert.deepEqual(turn.files, []);
});

test("an error ends the turn, and a retry that works clears it", () => {
  const s = session();
  s.user("go");
  s.assistant([text("Here is")], "error", { errorMessage: "529 overloaded" });
  const t = read(s.take());
  assert.deepEqual([t.turns[0].error, t.turns[0].done, t.turns[0].answer], ["529 overloaded", true, "Here is"]);
  s.assistant([text("Here.")]);
  appendLines(t, s.take());
  assert.equal(t.turns.length, 1);
  assert.deepEqual([t.turns[0].error, t.turns[0].answer], [null, "Here."]);
});

test("a step the conversation moved past without a result did not finish", () => {
  const s = session();
  s.user("go");
  s.assistant([call("c1", "bash", { command: "make" })], "toolUse");
  s.user("never mind");
  const t = read(s.lines);
  assert.equal(t.turns[0].steps[0].ok, false);
  // Should the result still come, it lands on its own step.
  s.result("c1", "bash", "built");
  appendLines(t, s.take().slice(-1));
  assert.deepEqual([t.turns[0].steps[0].ok, t.turns[0].steps[0].result], [true, "built"]);
});

test("only the active branch shows", () => {
  const s = session();
  const first = s.user("first");
  const reply = s.assistant([text("reply")]);
  s.user("left question");
  s.assistant([text("left answer")]);
  const t = read(s.take());
  assert.deepEqual(t.turns.map((turn) => turn.answer), ["reply", "left answer"]);
  const kept = t.turns[0];

  // The user goes back to the first reply and asks something else.
  s.leaf = reply;
  const right = s.user("right question");
  appendLines(t, s.take());
  assert.deepEqual(t.turns.map((turn) => turn.key), [first, right]);
  assert.deepEqual(t.turns[0], kept);
  s.assistant([text("right answer")]);
  appendLines(t, s.take());
  assert.deepEqual(t.turns.map((turn) => turn.answer), ["reply", "right answer"]);

  // A new root: the first message edited and sent again.
  s.leaf = null;
  s.user("first, reworded");
  appendLines(t, s.take());
  assert.deepEqual(t.turns.map((turn) => turn.user.text), ["first, reworded"]);
});

test("a branch summary is a note where the new branch starts", () => {
  const s = session();
  s.user("first");
  const reply = s.assistant([text("reply")]);
  s.user("dead end");
  s.leaf = reply;
  s.entry({ type: "branch_summary", fromId: "e3", summary: "Tried a dead end." });
  s.user("other way");
  const t = read(s.lines);
  assert.deepEqual(t.turns.map((turn) => (turn.user ? turn.user.text : turn.notes[0].kind)), ["first", "branch", "other way"]);
  assert.equal(t.turns[1].notes[0].text, "Tried a dead end.");
});

test("compaction keeps the history and leaves a note", () => {
  const s = session();
  s.user("one");
  s.assistant([text("1")]);
  const kept = s.user("two");
  s.assistant([text("2")]);
  const compaction = s.entry({ type: "compaction", summary: "Talked about numbers.", firstKeptEntryId: kept, tokensBefore: 50000 });
  s.user("three");
  s.assistant([text("3")]);
  const t = read(s.lines);
  assert.deepEqual(t.turns.map((turn) => turn.answer), ["1", "2", "", "3"]);
  assert.equal(t.turns[2].user, null);
  assert.deepEqual(t.turns[2].notes, [{ key: compaction, kind: "compaction", title: "", text: "Talked about numbers.", beforeStep: 0 }]);
});

test("a compaction in the middle of a turn stays inside it", () => {
  const s = session();
  s.user("big job");
  s.assistant([call("c1", "bash", { command: "make" })], "toolUse");
  s.result("c1", "bash", "ok");
  s.entry({ type: "compaction", summary: "So far.", firstKeptEntryId: "e1", tokensBefore: 9 });
  s.assistant([text("Next."), call("c2", "bash", { command: "make test" })], "toolUse");
  s.result("c2", "bash", "ok");
  s.assistant([text("Done.")]);
  const t = read(s.lines);
  assert.equal(t.turns.length, 1);
  assert.deepEqual(
    trail(t.turns[0]).map((row) => row.type),
    ["step", "note", "text", "step"]
  );
});

test("an extension's message after a finished reply opens a turn of its own", () => {
  const s = session();
  s.user("delegate this");
  s.assistant([call("c1", "delegate", { title: "Audit" })], "toolUse");
  s.result("c1", "delegate", "started");
  s.assistant([text("Started; I will report.")]);
  const shown = s.entry({ type: "custom_message", customType: "delegate-completion", content: "Audit finished.", display: true });
  s.assistant([text("The audit found nothing.")]);
  s.entry({ type: "custom_message", customType: "notify", content: [text("psst")], display: false });
  s.assistant([call("c2", "read", { path: "report.md" })], "toolUse");
  const t = read(s.lines);

  assert.equal(t.turns.length, 3);
  assert.equal(t.turns[0].answer, "Started; I will report.");
  assert.deepEqual([t.turns[1].key, t.turns[1].user, t.turns[1].answer], [shown, null, "The audit found nothing."]);
  assert.deepEqual(t.turns[1].notes, [{ key: shown, kind: "custom", title: "delegate-completion", text: "Audit finished.", beforeStep: 0 }]);
  // The hidden one shows nothing, but what it set off is not glued to the answer before.
  assert.deepEqual([t.turns[2].user, t.turns[2].notes, t.turns[2].steps.length], [null, [], 1]);
});

test("a hidden extension message alone opens nothing", () => {
  const s = session();
  s.user("hi");
  s.assistant([text("hello")]);
  s.entry({ type: "custom_message", customType: "notify", content: "psst", display: false });
  assert.equal(read(s.lines).turns.length, 1);
});

test("a command the user ran is a note", () => {
  const s = session();
  s.message({ role: "bashExecution", command: "git status", output: "clean", exitCode: 0, cancelled: false, truncated: false });
  const [turn] = read(s.lines).turns;
  assert.deepEqual(turn.notes.map((note) => [note.kind, note.title, note.text]), [["bash", "git status", "clean"]]);
});

test("entries that are not conversation are passed over, and bad lines counted", () => {
  const s = session();
  s.message({ role: "system", content: "", sections: { preamble: "You are…" } });
  s.entry({ type: "model_change", provider: "openai", modelId: "gpt" });
  s.entry({ type: "thinking_level_change", thinkingLevel: "high" });
  s.user("hi");
  s.entry({ type: "usage", kind: "cache_warm", usage: {} });
  s.entry({ type: "custom", customType: "x", data: {} });
  s.entry({ type: "label", targetId: "e4", label: "here" });
  s.entry({ type: "session_info", name: "Greeting" });
  s.entry({ type: "context_edit", targetId: "e4", replacement: null });
  s.entry({ type: "something_new" });
  s.assistant([text("hello")]);
  const t = read([...s.lines, "", "{not json", '{"recordType":"other tool"}', "42"]);
  assert.equal(t.turns.length, 1);
  assert.deepEqual([t.turns[0].user.text, t.turns[0].answer], ["hi", "hello"]);
  assert.equal(t.skipped, 3);
});

test("images are kept as references, not as data", () => {
  const s = session();
  const id = s.user([text("what is this?"), { type: "image", data: "QUJD".repeat(1000), mimeType: "image/png" }, text("and this")]);
  s.assistant([call("c1", "read", { path: "shot.png" })], "toolUse");
  s.message({ role: "toolResult", toolCallId: "c1", toolName: "read", content: [text("Read image"), { type: "image", data: "QUJD".repeat(1000), mimeType: "image/png" }], isError: false });
  const t = read(s.lines);
  assert.deepEqual(t.turns[0].user, {
    text: "what is this?\nand this",
    skill: null,
    images: [{ entryId: id, index: 1, mimeType: "image/png", bytes: 3000 }],
  });
  assert.equal(t.turns[0].steps[0].result, "Read image\n[image]");
  assert.ok(!JSON.stringify([...t.entries.values(), t.turns]).includes("QUJDQUJD"));
});

test("a skill invocation shows as the skill's name and what the user typed", () => {
  const s = session();
  s.user('<skill name="tdd" location="/home/u/.agents/skills/tdd/SKILL.md">\nReferences are relative to /x.\n\n# TDD\nlong body\n</skill>\n\nadd the parser');
  s.user('<skill name="grilling" location="/x/SKILL.md">\nbody\n</skill>');
  s.user("plain string content");
  s.lines[s.lines.length - 1] = s.lines[s.lines.length - 1].replace('[{"type":"text","text":"plain string content"}]', '"plain string content"');
  const t = read(s.lines);
  assert.deepEqual(t.turns.map((turn) => [turn.user.skill, turn.user.text]), [
    ["tdd", "add the parser"],
    ["grilling", ""],
    [null, "plain string content"],
  ]);
});

test("history that starts mid-way (a first read of the file's tail) still reads", () => {
  const s = session();
  s.user("early");
  s.assistant([call("c0", "ls", {})], "toolUse");
  s.result("c0", "ls", "a b");
  s.assistant([text("Listing done."), call("c1", "read", { path: "a" })], "toolUse");
  s.result("c1", "read", "A");
  s.assistant([text("early answer")]);
  s.user("late");
  s.assistant([text("late answer")]);
  // The first three entries and the header were not read.
  const t = read(s.lines.slice(4));
  assert.equal(t.header, null);
  assert.equal(t.turns.length, 2);
  assert.deepEqual([t.turns[0].user, t.turns[0].steps.map((step) => step.id), t.turns[0].answer], [null, ["c1"], "early answer"]);
  assert.equal(t.turns[1].user.text, "late");
});

test("feeding line by line gives what feeding at once gives", () => {
  const s = session();
  s.user("one");
  s.assistant([text("a"), call("c1", "edit", { path: "f", edits: [{ oldText: "1", newText: "2" }] })], "toolUse");
  s.result("c1", "edit", "ok");
  const fork = s.assistant([text("done")]);
  s.user("two");
  s.assistant([], "error", { errorMessage: "boom" });
  s.leaf = fork;
  s.entry({ type: "custom_message", customType: "x", content: "note", display: true });
  s.user("three");
  s.assistant([text("3")]);

  const once = read(s.lines);
  const slowly = createTranscript();
  for (const line of s.lines) appendLines(slowly, [line]);
  assert.deepEqual(slowly.turns, once.turns);
  assert.equal(once.rev, 1);
  assert.equal(slowly.rev, s.lines.length - 1); // the header changes no turn

  // The same line fed twice changes nothing.
  appendLines(slowly, [s.lines[3]]);
  assert.deepEqual(slowly.turns, once.turns);
});

test("appending to a big session touches only its last turn", () => {
  const s = session();
  const filler = "x".repeat(900);
  const count = 7500;
  for (let i = 0; i < count; i++) {
    s.user(`question ${i}`, 10);
    s.assistant([text(filler), call(`c${i}`, "read", { path: `f${i}.c` })], "toolUse", {}, 10);
    s.result(`c${i}`, "read", filler, {}, 10);
    s.assistant([text(`answer ${i}`)], "stop", {}, 10);
  }
  const lines = s.take();
  assert.ok(lines.reduce((sum, line) => sum + line.length + 1, 0) > 20e6, "a 20 MB session");
  const t = createTranscript();
  const began = performance.now();
  appendLines(t, lines);
  const full = performance.now() - began;
  assert.equal(t.turns.length, count);

  const turns = t.turns;
  const before = turns.slice();
  // The quickest of a few appends, so that a pause of the runtime does not count.
  let one = Infinity;
  for (let i = 0; i < 5; i++) {
    s.assistant([text(`more ${i}`)], "stop", {}, 10);
    const again = performance.now();
    appendLines(t, s.take());
    one = Math.min(one, performance.now() - again);
  }

  assert.equal(t.turns, turns); // the same list, not a rebuilt one
  for (let i = 0; i < before.length; i++) assert.equal(turns[i], before[i]);
  assert.equal(turns[count - 1].answer, `answer ${count - 1}\n\nmore 0\n\nmore 1\n\nmore 2\n\nmore 3\n\nmore 4`);
  assert.ok(one < full / 100, `one line took ${one} ms, the whole session ${full} ms`);
});
