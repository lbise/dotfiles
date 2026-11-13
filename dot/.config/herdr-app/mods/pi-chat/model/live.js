// The transcript and state.json as one list of turns.
//
// The session file only gains a message when it is complete; state.json knows what
// is happening now. While Pi works, the last turn also shows the steps the file
// does not have yet, which steps still run, and the reply being written. Turn keys
// and step ids stay the same when the file catches up, so nothing in the list moves.

import { clip, stepKind } from "./tools.js";
import { newTurn } from "./transcript.js";

const KINDS = ["look", "run", "edit", "other"];

/** @typedef {import("./transcript.js").Step} Step */
/** @typedef {import("./transcript.js").Turn} Turn */

/**
 * True while Pi is working or waiting for an answer to a question.
 * @param {import("./protocol.js").State|null} state
 */
export function isLive(state) {
  return !!state && (state.status === "working" || state.status === "asking");
}

/**
 * @param {import("./transcript.js").Transcript} transcript
 * @param {import("./protocol.js").State|null} state The parsed state.json; null when Pi is not there.
 * @returns {{ turns: Turn[], live: boolean }} `turns`
 *   is the transcript's own array when there is nothing to add to it.
 */
export function mergeLive(transcript, state) {
  const turns = transcript.turns;
  const last = turns.length ? turns[turns.length - 1] : null;
  if (!isLive(state)) {
    // Nothing runs: a step the file never saw finish was interrupted.
    if (!last || !last.steps.some((step) => step.ok === undefined)) return { turns, live: false };
    const steps = last.steps.map((step) => (step.ok === undefined ? { ...step, ok: false } : step));
    return { turns: withLast(turns, { ...last, steps }), live: false };
  }

  /** @type {Partial<NonNullable<import("./protocol.js").State["turn"]>>} */
  const running = state.turn && typeof state.turn === "object" ? state.turn : {};
  const liveSteps = Array.isArray(running.steps) ? running.steps.filter((step) => step && typeof step.id === "string") : [];
  const fresh = liveSteps.filter((step) => !transcript.steps.has(step.id));
  const begun = Number.isFinite(running.startedAt) ? running.startedAt : null;
  // The running turn is the file's last turn, unless that one is finished and
  // this one began after it and shares no step with the file: then the file
  // does not have its first message yet.
  const ahead = !last || (last.done && fresh.length === liveSteps.length && begun !== null && begun > (last.endedAt || 0));
  let base = last;
  if (ahead) {
    // The turn the file opens next takes this key, so the row stays the same row.
    if (!transcript.reserved) transcript.reserved = `live:${turns.length}`;
    base = newTurn(transcript.reserved, null);
  }

  const byId = new Map(liveSteps.map((step) => [step.id, step]));
  const steps = base.steps.map((step) => (step.ok === undefined && byId.has(step.id) ? timed({ ...step }, byId.get(step.id)) : step));
  for (const step of fresh) {
    const name = String(step.name || "");
    const kind = KINDS.includes(step.kind) ? step.kind : stepKind(name);
    steps.push(timed({ id: step.id, kind, name, label: clip(String(step.label || name), 200), result: "" }, step));
  }

  // The reply being written is the answer in progress, unless it is a stale copy
  // of text the file already holds (state.json is read a moment before the file).
  const stream = state.stream && typeof state.stream.text === "string" ? state.stream.text.trim() : "";
  const written = base.answer || (base.narration.length ? base.narration[base.narration.length - 1].text : "");
  const startedAt = base.startedAt === null ? begun : base.startedAt;
  /** @type {Turn} */
  const merged = {
    ...base,
    steps,
    answer: stream && !written.startsWith(stream) ? stream : base.answer,
    startedAt,
    endedAt: null,
    // As of state.updated: the agent machine's clock, not this one's.
    durationMs: startedAt !== null && Number.isFinite(state.updated) ? Math.max(0, state.updated - startedAt) : null,
    error: null,
    aborted: false,
    done: false,
    live: true,
    thinking: !!(state.stream && state.stream.thinking),
  };
  return { turns: ahead ? turns.concat([merged]) : withLast(turns, merged), live: true };
}

/**
 * @param {Turn[]} turns
 * @param {Turn} turn
 */
function withLast(turns, turn) {
  const copy = turns.slice();
  copy[copy.length - 1] = turn;
  return copy;
}

/**
 * Puts what state.json knows of a step's outcome and timing on `step`.
 * @param {Step} step
 * @param {import("./protocol.js").LiveStep} live
 */
function timed(step, live) {
  if (typeof live.ok === "boolean") step.ok = live.ok;
  if (Number.isFinite(live.startedAt) && Number.isFinite(live.endedAt)) step.durationMs = Math.max(0, live.endedAt - live.startedAt);
  else if (Number.isFinite(live.startedAt)) step.startedAt = live.startedAt;
  return step;
}
