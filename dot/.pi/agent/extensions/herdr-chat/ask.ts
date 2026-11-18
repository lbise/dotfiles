export type AskOption = { label: string; description?: string; recommended?: boolean };
export type Question = { question: string; context?: string; options: AskOption[]; multi: boolean };
export type Ask = { id: string; questions: Question[] };
/**
 * One question's answer: the labels chosen (in option order) and the user's own words. Words
 * with labels are a comment on the choice; words alone are an answer of their own.
 */
export type Reply = { selected: string[]; text: string };
/** One reply per question, or undefined when the questions were dismissed. */
export type Answer = Reply[] | undefined;

export const MAX_QUESTIONS = 4;

type DialogOptions = { signal?: AbortSignal };
export type AskUi = {
  select(title: string, options: string[], opts?: DialogOptions): Promise<string | undefined>;
  input(title: string, placeholder?: string, opts?: DialogOptions): Promise<string | undefined>;
};

const WRITE = "✎ Write your own answer, or a comment on your choice";

/** The tool's parameters as questions; throws a message for the model when they cannot be asked. */
export function readQuestions(params: { questions?: unknown }): Question[] {
  const list = params.questions;
  if (!Array.isArray(list) || list.length < 1 || list.length > MAX_QUESTIONS) {
    throw new Error(`ask_user: give 1 to ${MAX_QUESTIONS} questions`);
  }
  return list.map((q: any) => {
    if (!q || typeof q.question !== "string" || !q.question.trim()) throw new Error("ask_user: every question needs its text");
    const options: AskOption[] = (Array.isArray(q.options) ? q.options : [])
      .filter((o: any) => o && typeof o.label === "string" && o.label.trim())
      .map((o: any) => ({
        label: o.label,
        ...(typeof o.description === "string" && o.description && { description: o.description }),
        ...(o.recommended === true && { recommended: true }),
      }));
    if (new Set(options.map((o) => o.label)).size !== options.length) throw new Error(`ask_user: two options share a label in "${q.question}"`);
    return {
      question: q.question,
      ...(typeof q.context === "string" && q.context.trim() && { context: q.context }),
      options,
      multi: q.multi === true,
    };
  });
}

/**
 * A remote answer checked against the questions: one reply per question, known labels only
 * (put in option order), at most one on a single-choice question. Throws when malformed.
 */
export function readAnswer(value: unknown, questions: Question[]): Reply[] {
  const bad = () => new Error("answer: value must be one { selected, text } per question");
  if (!Array.isArray(value) || value.length !== questions.length) throw bad();
  return value.map((reply: any, i) => {
    const { options, multi } = questions[i];
    if (!reply || typeof reply !== "object") throw bad();
    const picked = reply.selected ?? [];
    const text = reply.text ?? "";
    if (!Array.isArray(picked) || !picked.every((l: unknown) => typeof l === "string") || typeof text !== "string") throw bad();
    const selected = options.map((o) => o.label).filter((label) => picked.includes(label));
    if (selected.length !== new Set(picked).size) throw new Error(`answer: unknown option in ${JSON.stringify(picked)}`);
    if (!multi && selected.length > 1) throw new Error("answer: one option only on a single-choice question");
    return { selected, text: text.trim() };
  });
}

function optionRow(option: AskOption, mark: string): string {
  const tag = option.recommended ? " (recommended)" : "";
  return `${mark}${option.label}${tag}${option.description ? ` — ${option.description}` : ""}`;
}

/**
 * One question with pi's own select and input prompts. A single choice answers on pick; several
 * re-open the list with check marks until "Done". The write row keeps the user's words, sent with
 * the pick; with words and no pick, a send row answers with the words alone.
 */
async function askOne(ui: AskUi, title: string, q: Question, signal: AbortSignal): Promise<Reply | undefined> {
  const chosen = new Set<string>();
  let text = "";
  while (!signal.aborted) {
    const rows = q.options.map((option) => optionRow(option, q.multi ? (chosen.has(option.label) ? "[x] " : "[ ] ") : ""));
    const write = text ? `✎ Your words: ${text}` : WRITE;
    const done = q.multi ? `Done (${chosen.size} selected${text ? " + your words" : ""})` : "Send your words as the answer";
    const list = [...rows, write, ...(q.multi || text ? [done] : [])];
    const picked = await ui.select(title, list, { signal });
    if (picked === undefined) return undefined;

    if (picked === done) return { selected: q.options.map((o) => o.label).filter((label) => chosen.has(label)), text };
    if (picked === write) {
      const typed = await ui.input(title, text || "Your answer, or a comment to send with your choice", { signal });
      if (typed !== undefined) text = typed.trim(); // Escape keeps what was written
      continue;
    }
    const label = q.options[rows.indexOf(picked)]?.label;
    if (label === undefined) return undefined;
    if (!q.multi) return { selected: [label], text };
    if (!chosen.delete(label)) chosen.add(label);
  }
  return undefined;
}

/** Asks the questions one after the other. Resolves undefined when dismissed, by the user (Escape) or by `signal`. */
export async function askInTui(ui: AskUi, ask: Ask, signal: AbortSignal): Promise<Answer> {
  const replies: Reply[] = [];
  for (const [i, q] of ask.questions.entries()) {
    const count = ask.questions.length > 1 ? `(${i + 1}/${ask.questions.length}) ` : "";
    const reply = await askOne(ui, `${count}${q.question}${q.context ? `\n\n${q.context}` : ""}`, q, signal);
    if (!reply) return undefined;
    replies.push(reply);
  }
  return replies;
}

function describeReply({ selected, text }: Reply): string {
  if (selected.length && text) return `The user chose: ${selected.join(", ")}. Their comment: ${text}`;
  if (selected.length) return `The user chose: ${selected.join(", ")}`;
  if (text) return `The user answered in their own words: ${text}`;
  return "The user chose none of the options.";
}

/** What the model reads as the tool result. */
export function describeAnswer(questions: Question[], answer: Answer): string {
  if (answer === undefined) return "The user dismissed the question without answering.";
  if (questions.length === 1) return describeReply(answer[0]);
  return answer.map((reply, i) => `${i + 1}. ${questions[i].question}\n${describeReply(reply)}`).join("\n\n");
}

/** One ask at a time, answered by the TUI prompts or by answer(), whichever comes first. */
export function createAsker(onChange: () => void) {
  let count = 0;
  let pending: { ask: Ask; resolve: (answer: Answer) => void } | undefined;

  return {
    current: (): Ask | null => pending?.ask ?? null,

    /**
     * Answers the pending ask from outside the TUI; null dismisses it. False when `id` is not the
     * pending one; throws when the value does not fit its questions.
     */
    answer(id: unknown, value: unknown): boolean {
      if (!pending || pending.ask.id !== id) return false;
      pending.resolve(value === null ? undefined : readAnswer(value, pending.ask.questions));
      return true;
    },

    async ask(ui: AskUi, questions: Question[], signal?: AbortSignal): Promise<Answer> {
      if (pending) throw new Error("another question is waiting for an answer");
      const ask: Ask = { id: `a${++count}`, questions };
      // Closes the TUI prompt when the answer came from elsewhere or the agent was aborted.
      const dismiss = new AbortController();
      const onAbort = () => dismiss.abort();
      if (signal?.aborted) onAbort();
      signal?.addEventListener("abort", onAbort, { once: true });
      try {
        const remote = new Promise<Answer>((resolve) => {
          pending = { ask, resolve };
        });
        onChange();
        return await Promise.race([remote, askInTui(ui, ask, dismiss.signal)]);
      } finally {
        pending = undefined;
        dismiss.abort();
        signal?.removeEventListener("abort", onAbort);
        onChange();
      }
    },
  };
}
