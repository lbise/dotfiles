// One draft between the reply box and Pi's own input box. Coming to the chat
// takes Pi's draft into the reply box; leaving it (for the terminal or another
// tab) hands the reply box's text to Pi. Only at those moments: what someone is
// typing is never replaced, and a draft Pi did not take stays here.

import { feedFor, sendCommand } from "./feeds.js";

// Pi notices typing within a second: until then a fresher draft may still come in.
const SETTLE = 1500;

export class SharedDraft {
  /** @param {import("./composer.js").Composer} composer */
  constructor(composer) {
    this.composer = composer;
    this.took = null; // { key, text, until }: what the reply box was given on arrival
    this.kept = new Map(); // session key -> a draft Pi did not take (yet)
  }

  /** The chat shows this Pi now: the reply box takes its draft. */
  arrive(pi) {
    const state = feedFor(pi).chat.state;
    const text = this.kept.has(pi.key) ? this.kept.get(pi.key) : (state && state.draft) || "";
    this.composer.set(text);
    this.took = { key: pi.key, text, until: Date.now() + SETTLE };
  }

  /** After a read: a draft Pi reports just after arrival still comes in, while the box is untouched. */
  follow(pi) {
    const took = this.took;
    const state = feedFor(pi).chat.state;
    if (!took || took.key !== pi.key || Date.now() > took.until || !state || this.kept.has(pi.key)) return;
    const draft = state.draft || "";
    if (draft === took.text || this.composer.text() !== took.text) return;
    this.composer.set(draft);
    took.text = draft;
  }

  /** Pi is about to set its draft (a move back to one of your messages): the reply box takes it, unless typed in meanwhile. */
  expect(pi, within) {
    this.kept.delete(pi.key);
    this.took = { key: pi.key, text: this.composer.text(), until: Date.now() + within };
  }

  /**
   * The chat stops showing this Pi: Pi's input box takes the reply box's text,
   * unless that is still what came from it.
   * @param {(cx: object) => void} failed Called when Pi did not take it.
   */
  leave(pi, cx, failed) {
    const text = this.composer.text();
    const took = this.took;
    this.took = null;
    if (took && took.key === pi.key && took.text === text && !this.kept.has(pi.key)) return;
    this.kept.set(pi.key, text);
    cx.spawn(async (cx) => {
      try {
        await sendCommand(feedFor(pi), { type: "draft", text });
        if (this.kept.get(pi.key) === text) this.kept.delete(pi.key);
      } catch {
        failed(cx);
      }
    });
  }
}
