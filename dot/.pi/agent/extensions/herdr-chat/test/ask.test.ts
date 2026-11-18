import assert from "node:assert/strict";
import test from "node:test";

import { type AskUi, createAsker, describeAnswer, readAnswer, readQuestions } from "../ask.ts";

const accent = { question: "Which accent?", options: [{ label: "Lime", description: "bright", recommended: true }, { label: "Teal" }], multi: false };
const question = [accent];
const WRITE = "✎ Write your own answer, or a comment on your choice";

/** A UI whose prompts wait until the test answers them, and close with undefined on abort like pi's. */
function fakeUi() {
  const prompts: { kind: string; title: string; options?: string[]; answer: (value: string | undefined) => void; signal?: AbortSignal }[] = [];
  const open = (kind: string, title: string, options: string[] | undefined, signal?: AbortSignal) =>
    new Promise<string | undefined>((resolve) => {
      if (signal?.aborted) return resolve(undefined);
      signal?.addEventListener("abort", () => resolve(undefined), { once: true });
      prompts.push({ kind, title, options, answer: resolve, signal });
    });
  const ui: AskUi = {
    select: (title, options, opts) => open("select", title, options, opts?.signal),
    input: (title, _placeholder, opts) => open("input", title, undefined, opts?.signal),
  };
  return { ui, prompts };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test("an answer from outside wins and closes the TUI prompt", async () => {
  const { ui, prompts } = fakeUi();
  let changes = 0;
  const asker = createAsker(() => changes++);
  const answer = asker.ask(ui, question);

  assert.deepEqual(asker.current(), { id: "a1", questions: question });
  assert.deepEqual(prompts[0].options, ["Lime (recommended) — bright", "Teal", WRITE]);
  assert.equal(asker.answer("a0", [{ selected: ["Teal"], text: "" }]), false);
  assert.throws(() => asker.answer("a1", [{ selected: ["Amber"] }]), /unknown option/);
  assert.equal(asker.answer("a1", [{ selected: ["Teal"], text: " darker " }]), true);

  assert.deepEqual(await answer, [{ selected: ["Teal"], text: "darker" }]);
  assert.equal(prompts[0].signal!.aborted, true);
  assert.equal(asker.current(), null);
  assert.equal(changes, 2);
  // The loser cannot answer any more, and neither can a second answer.
  prompts[0].answer("Lime (recommended) — bright");
  assert.equal(asker.answer("a1", [{ selected: ["Lime"] }]), false);
});

test("the TUI wins when it answers first", async () => {
  const { ui, prompts } = fakeUi();
  const asker = createAsker(() => {});
  const answer = asker.ask(ui, question);
  prompts[0].answer("Lime (recommended) — bright");

  assert.deepEqual(await answer, [{ selected: ["Lime"], text: "" }]);
  assert.equal(asker.answer("a1", [{ selected: ["Teal"] }]), false);
  // The next question gets a new id.
  void asker.ask(ui, question);
  assert.equal(asker.current()!.id, "a2");
});

test("words written first are a comment on the pick, or the answer on their own", async () => {
  const { ui, prompts } = fakeUi();
  const asker = createAsker(() => {});
  const commented = asker.ask(ui, question);
  prompts[0].answer(WRITE);
  await settle();
  assert.equal(prompts[1].kind, "input");
  prompts[1].answer("  darker  ");
  await settle();
  assert.deepEqual(prompts[2].options, ["Lime (recommended) — bright", "Teal", "✎ Your words: darker", "Send your words as the answer"]);
  prompts[2].answer("Teal");
  assert.deepEqual(await commented, [{ selected: ["Teal"], text: "darker" }]);

  const own = asker.ask(ui, question);
  prompts[3].answer(WRITE);
  await settle();
  prompts[4].answer(undefined); // Escape: back to the options, nothing written
  await settle();
  assert.deepEqual(prompts[5].options, ["Lime (recommended) — bright", "Teal", WRITE]);
  prompts[5].answer(WRITE);
  await settle();
  prompts[6].answer("Amber");
  await settle();
  prompts[7].answer("Send your words as the answer");
  assert.deepEqual(await own, [{ selected: [], text: "Amber" }]);
});

test("multi select toggles options and keeps words until done", async () => {
  const { ui, prompts } = fakeUi();
  const asker = createAsker(() => {});
  const answer = asker.ask(ui, [{ ...accent, multi: true }]);
  assert.deepEqual(prompts[0].options, ["[ ] Lime (recommended) — bright", "[ ] Teal", WRITE, "Done (0 selected)"]);
  prompts[0].answer("[ ] Teal");
  await settle();
  prompts[1].answer("[ ] Lime (recommended) — bright");
  await settle();
  assert.deepEqual(prompts[2].options!.slice(0, 2), ["[x] Lime (recommended) — bright", "[x] Teal"]);
  prompts[2].answer("[x] Teal");
  await settle();
  prompts[3].answer(WRITE);
  await settle();
  prompts[4].answer("and Amber");
  await settle();
  prompts[5].answer("Done (1 selected + your words)");
  assert.deepEqual(await answer, [{ selected: ["Lime"], text: "and Amber" }]);
});

test("several questions are asked one after the other, with their context", async () => {
  const { ui, prompts } = fakeUi();
  const asker = createAsker(() => {});
  const font = { question: "Which font?", context: "Both are **mono**.", options: [{ label: "Geist" }, { label: "Iosevka" }], multi: false };
  const answer = asker.ask(ui, [accent, font]);
  assert.equal(prompts[0].title, "(1/2) Which accent?");
  prompts[0].answer("Teal");
  await settle();
  assert.equal(prompts[1].title, "(2/2) Which font?\n\nBoth are **mono**.");
  prompts[1].answer("Geist");
  assert.deepEqual(await answer, [{ selected: ["Teal"], text: "" }, { selected: ["Geist"], text: "" }]);
});

test("escape or an agent abort dismisses the question", async () => {
  const { ui, prompts } = fakeUi();
  const asker = createAsker(() => {});
  const escaped = asker.ask(ui, question);
  prompts[0].answer(undefined);
  assert.equal(await escaped, undefined);

  const abort = new AbortController();
  const aborted = asker.ask(ui, question, abort.signal);
  abort.abort();
  assert.equal(await aborted, undefined);
  assert.equal(asker.current(), null);

  const skipped = asker.ask(ui, question);
  assert.equal(asker.answer("a3", null), true);
  assert.equal(await skipped, undefined);
  assert.equal(prompts.at(-1)!.signal!.aborted, true);
});

test("only one question waits at a time", async () => {
  const { ui } = fakeUi();
  const asker = createAsker(() => {});
  void asker.ask(ui, question);
  await assert.rejects(asker.ask(ui, question), /another question/);
  assert.equal(asker.current()!.id, "a1");
});

test("the tool's parameters become questions", () => {
  assert.deepEqual(
    readQuestions({ questions: [{ question: "Q?", context: " ", options: [{ label: "A", description: "", recommended: false, x: 1 }, { label: "" }], multi: "yes" }] }),
    [{ question: "Q?", options: [{ label: "A" }], multi: false }],
  );
  assert.throws(() => readQuestions({}), /1 to 4 questions/);
  assert.throws(() => readQuestions({ questions: Array(5).fill(accent) }), /1 to 4 questions/);
  assert.throws(() => readQuestions({ questions: [{ question: " ", options: [] }] }), /needs its text/);
  assert.throws(() => readQuestions({ questions: [{ question: "Q?", options: [{ label: "A" }, { label: "A" }] }] }), /share a label/);
});

test("a remote answer must fit the questions", () => {
  const multi = { ...accent, multi: true };
  assert.deepEqual(readAnswer([{ selected: ["Teal", "Lime"] }], [multi]), [{ selected: ["Lime", "Teal"], text: "" }]);
  assert.deepEqual(readAnswer([{ text: "Amber" }], question), [{ selected: [], text: "Amber" }]);
  assert.throws(() => readAnswer(["Teal"], question), /one \{ selected, text \} per question/);
  assert.throws(() => readAnswer([], question), /per question/);
  assert.throws(() => readAnswer([{ selected: ["Lime", "Teal"] }], question), /one option only/);
});

test("answers read as sentences for the model", () => {
  assert.equal(describeAnswer(question, [{ selected: ["Lime", "Teal"], text: "" }]), "The user chose: Lime, Teal");
  assert.equal(describeAnswer(question, [{ selected: ["Teal"], text: "darker" }]), "The user chose: Teal. Their comment: darker");
  assert.equal(describeAnswer(question, [{ selected: [], text: "" }]), "The user chose none of the options.");
  assert.equal(describeAnswer(question, [{ selected: [], text: "Amber" }]), "The user answered in their own words: Amber");
  assert.match(describeAnswer(question, undefined), /dismissed/);
  assert.equal(
    describeAnswer([accent, { ...accent, question: "Which ground?" }], [{ selected: ["Teal"], text: "" }, { selected: [], text: "Dark" }]),
    "1. Which accent?\nThe user chose: Teal\n\n2. Which ground?\nThe user answered in their own words: Dark",
  );
});
