import assert from "node:assert/strict";
import test from "node:test";

import { type AskUi, createAsker, describeAnswer } from "../ask.ts";

const question = { question: "Which accent?", options: [{ label: "Lime", description: "bright" }, { label: "Teal" }], multi: false };

/** A UI whose prompts wait until the test answers them, and close with undefined on abort like pi's. */
function fakeUi() {
  const prompts: { kind: string; options?: string[]; answer: (value: string | undefined) => void; signal?: AbortSignal }[] = [];
  const open = (kind: string, options: string[] | undefined, signal?: AbortSignal) =>
    new Promise<string | undefined>((resolve) => {
      if (signal?.aborted) return resolve(undefined);
      signal?.addEventListener("abort", () => resolve(undefined), { once: true });
      prompts.push({ kind, options, answer: resolve, signal });
    });
  const ui: AskUi = {
    select: (_title, options, opts) => open("select", options, opts?.signal),
    input: (_title, _placeholder, opts) => open("input", undefined, opts?.signal),
  };
  return { ui, prompts };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test("an answer from outside wins and closes the TUI prompt", async () => {
  const { ui, prompts } = fakeUi();
  let changes = 0;
  const asker = createAsker(() => changes++);
  const answer = asker.ask(ui, question);

  assert.deepEqual(asker.current(), { id: "a1", ...question });
  assert.deepEqual(prompts[0].options, ["Lime — bright", "Teal", "Other (type an answer)"]);
  assert.equal(asker.answer("a0", ["Teal"]), false);
  assert.equal(asker.answer("a1", ["Teal"]), true);

  assert.deepEqual(await answer, ["Teal"]);
  assert.equal(prompts[0].signal!.aborted, true);
  assert.equal(asker.current(), null);
  assert.equal(changes, 2);
  // The loser cannot answer any more, and neither can a second answer.
  prompts[0].answer("Lime — bright");
  assert.equal(asker.answer("a1", ["Lime"]), false);
});

test("the TUI wins when it answers first", async () => {
  const { ui, prompts } = fakeUi();
  const asker = createAsker(() => {});
  const answer = asker.ask(ui, question);
  prompts[0].answer("Lime — bright");

  assert.deepEqual(await answer, ["Lime"]);
  assert.equal(asker.answer("a1", ["Teal"]), false);
  // The next question gets a new id.
  void asker.ask(ui, question);
  assert.equal(asker.current()!.id, "a2");
});

test("other asks for free text; escaping it returns to the options", async () => {
  const { ui, prompts } = fakeUi();
  const asker = createAsker(() => {});
  const answer = asker.ask(ui, question);
  prompts[0].answer("Other (type an answer)");
  await settle();
  assert.equal(prompts[1].kind, "input");
  prompts[1].answer(undefined);
  await settle();
  assert.equal(prompts[2].kind, "select");
  prompts[2].answer("Other (type an answer)");
  await settle();
  prompts[3].answer("  Amber  ");
  assert.equal(await answer, "Amber");
});

test("multi select toggles options until done", async () => {
  const { ui, prompts } = fakeUi();
  const asker = createAsker(() => {});
  const answer = asker.ask(ui, { ...question, multi: true });
  assert.deepEqual(prompts[0].options, ["[ ] Lime — bright", "[ ] Teal", "Other (type an answer)", "Done (0 selected)"]);
  prompts[0].answer("[ ] Teal");
  await settle();
  prompts[1].answer("[ ] Lime — bright");
  await settle();
  assert.deepEqual(prompts[2].options!.slice(0, 2), ["[x] Lime — bright", "[x] Teal"]);
  prompts[2].answer("[x] Teal");
  await settle();
  prompts[3].answer("Done (1 selected)");
  assert.deepEqual(await answer, ["Lime"]);
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
});

test("only one question waits at a time", async () => {
  const { ui } = fakeUi();
  const asker = createAsker(() => {});
  void asker.ask(ui, question);
  await assert.rejects(asker.ask(ui, question), /another question/);
  assert.equal(asker.current()!.id, "a1");
});

test("answers read as sentences for the model", () => {
  assert.equal(describeAnswer(["Lime", "Teal"]), "The user chose: Lime, Teal");
  assert.equal(describeAnswer([]), "The user chose none of the options.");
  assert.equal(describeAnswer("Amber"), "The user answered in their own words: Amber");
  assert.match(describeAnswer(undefined), /dismissed/);
});
