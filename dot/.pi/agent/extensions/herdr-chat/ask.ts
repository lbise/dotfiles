export type AskOption = { label: string; description?: string };
export type Ask = { id: string; question: string; options: AskOption[]; multi: boolean };
/** Labels chosen, free text as one string, or undefined when the question was dismissed. */
export type Answer = string[] | string | undefined;

type DialogOptions = { signal?: AbortSignal };
export type AskUi = {
  select(title: string, options: string[], opts?: DialogOptions): Promise<string | undefined>;
  input(title: string, placeholder?: string, opts?: DialogOptions): Promise<string | undefined>;
};

const OTHER = "Other (type an answer)";

/**
 * Asks with pi's own select and input prompts. Multi select re-opens the list with check marks
 * until "Done". Resolves undefined when dismissed, by the user (Escape) or by `signal`.
 */
export async function askInTui(ui: AskUi, ask: Ask, signal: AbortSignal): Promise<Answer> {
  const chosen = new Set<string>();
  while (!signal.aborted) {
    const rows = ask.options.map((option) => {
      const mark = ask.multi ? (chosen.has(option.label) ? "[x] " : "[ ] ") : "";
      return `${mark}${option.label}${option.description ? ` — ${option.description}` : ""}`;
    });
    const done = `Done (${chosen.size} selected)`;
    const list = ask.multi ? [...rows, OTHER, done] : [...rows, OTHER];
    const picked = await ui.select(ask.question, list, { signal });
    if (picked === undefined) return undefined;

    if (picked === done && ask.multi) return ask.options.map((o) => o.label).filter((label) => chosen.has(label));
    if (picked === OTHER) {
      const text = (await ui.input(ask.question, "Type your answer", { signal }))?.trim();
      if (text) return text;
      continue; // Escape or nothing typed: back to the options
    }
    const label = ask.options[rows.indexOf(picked)]?.label;
    if (label === undefined) return undefined;
    if (!ask.multi) return [label];
    if (!chosen.delete(label)) chosen.add(label);
  }
  return undefined;
}

/** What the model reads as the tool result. */
export function describeAnswer(answer: Answer): string {
  if (answer === undefined) return "The user dismissed the question without answering.";
  if (typeof answer === "string") return `The user answered in their own words: ${answer}`;
  return answer.length ? `The user chose: ${answer.join(", ")}` : "The user chose none of the options.";
}

/** One question at a time, answered by the TUI prompts or by answer(), whichever comes first. */
export function createAsker(onChange: () => void) {
  let count = 0;
  let pending: { ask: Ask; resolve: (answer: Answer) => void } | undefined;

  return {
    current: (): Ask | null => pending?.ask ?? null,

    /** Answers the pending question from outside the TUI. False when `id` is not the pending one. */
    answer(id: unknown, value: string[] | string): boolean {
      if (!pending || pending.ask.id !== id) return false;
      pending.resolve(value);
      return true;
    },

    async ask(ui: AskUi, question: Omit<Ask, "id">, signal?: AbortSignal): Promise<Answer> {
      if (pending) throw new Error("another question is waiting for an answer");
      const ask: Ask = { id: `a${++count}`, ...question };
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
