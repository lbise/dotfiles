// The conversation as the rows the timeline draws: each turn becomes its message,
// its work line, its answer and its changed files; a compaction running now, its line.

import { isLive } from "./model/live.js";

/**
 * @param {import("./model/chat.js").Chat} chat
 * @param {{ text: string }|null} sent A message sent from here that the conversation does not hold yet.
 * @returns {Array<{ key: string, kind: string, estimate: number, turn?: object, text?: string, note?: object }>}
 */
export function conversationRows(chat, sent) {
  const rows = [];
  if (chat.truncated) rows.push({ key: "earlier", kind: "earlier", estimate: 40 });
  const turns = chat.turns;
  // A turn that started before its message reached the file comes right after that message.
  const last = turns.length ? turns[turns.length - 1] : null;
  const sentBefore = sent && last && last.live && !last.user ? last : null;
  for (const turn of turns) {
    if (turn === sentBefore) rows.push(sentRow(sent, chat));
    if (turn.user) rows.push({ key: `${turn.key}:user`, kind: "user", estimate: 64, text: turn.user.text, turn });
    const thought = turn.narration.some((part) => part.thought);
    if (turn.steps.length || turn.live || thought) rows.push({ key: `${turn.key}:work`, kind: "work", estimate: 44, turn });
    else for (const note of turn.notes) rows.push({ key: `${turn.key}:${note.key}`, kind: "note", estimate: 30, note });
    if (turn.answer) rows.push({ key: `${turn.key}:answer`, kind: "answer", estimate: 120, turn });
    if (turn.error || turn.aborted) rows.push({ key: `${turn.key}:end`, kind: "end", estimate: 30, turn });
    if (turn.files.length && !turn.live) rows.push({ key: `${turn.key}:files`, kind: "files", estimate: 48 + 34 * turn.files.length, turn });
  }
  if (sent && !sentBefore) rows.push(sentRow(sent, chat));
  if (chat.state && chat.state.status === "compacting") rows.push({ key: "compacting", kind: "compacting", estimate: 44 });
  return rows;
}

export const SENT_KEY = "sent";

// Sent while Pi works, a message waits for Pi to take it.
function sentRow(sent, chat) {
  return { key: SENT_KEY, kind: "user", estimate: 64, text: sent.text, queued: isLive(chat.state) };
}
