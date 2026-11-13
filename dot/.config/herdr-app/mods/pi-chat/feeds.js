// One feed per Pi terminal: its conversation, as last read from its machine.
// Plain data shared by every copy of the mod; the copies' timers drive the reads.

import { exec } from "herdr";
import { chatPollArgv, chatReceive, createChat } from "./model/chat.js";
import { inboxArgvs } from "./model/protocol.js";

const TIMEOUT = 8000;
const KEPT = 8;
// After this many failed reads in a row the machine counts as not answering.
const SILENT_AFTER = 2;

const feeds = new Map();

/** The feed of a Pi pane (see view.js), made on first use. */
export function feedFor(pi) {
  let feed = feeds.get(pi.address);
  if (!feed || feed.key !== pi.key) {
    feed = {
      key: pi.key,
      machine: pi.machine,
      id: pi.id,
      chat: createChat(),
      reads: 0, // reads that got an answer
      failures: 0, // failed reads in a row
      busy: false,
      readAt: 0,
      changedAt: 0, // when a read last brought something new, on this machine's clock
    };
    feeds.delete(pi.address);
    feeds.set(pi.address, feed);
    for (const address of [...feeds.keys()].slice(0, Math.max(0, feeds.size - KEPT))) feeds.delete(address);
  }
  return feed;
}

/** Pi runs in the terminal with the chat extension loaded. */
export function feedLive(feed, pi) {
  const state = feed.chat.state;
  return !!state && (pi.pid == null || state.pid === pi.pid);
}

/** The machine did not answer the last reads. */
export function feedSilent(feed) {
  return feed.failures >= SILENT_AFTER || (feed.failures > 0 && feed.reads === 0);
}

function signature(feed) {
  const { state, transcript, problem } = feed.chat;
  return `${state ? state.updated : ""}|${transcript.rev}|${problem}|${feedSilent(feed)}|${feed.reads > 0}`;
}

async function onMachine(feed, argv) {
  const result = await exec(argv[0], argv.slice(1), { on: feed.machine, timeout: TIMEOUT });
  if (result.code !== 0) throw new Error(result.stderr.trim() || `exit ${result.code}`);
  return result.stdout;
}

/** Reads the feed once. Resolves true when what the chat shows changed. */
export async function readFeed(feed) {
  if (feed.busy) return false;
  feed.busy = true;
  feed.readAt = Date.now();
  const before = signature(feed);
  try {
    chatReceive(feed.chat, await onMachine(feed, chatPollArgv(feed.chat, feed.id)));
    feed.reads++;
    feed.failures = 0;
  } catch {
    feed.failures++;
  } finally {
    feed.busy = false;
  }
  if (signature(feed) === before) return false;
  feed.changedAt = Date.now();
  return true;
}

/** Drops one command into the feed's inbox. Rejects when it did not get there. */
export async function sendCommand(feed, command) {
  for (const argv of inboxArgvs(feed.id, command)) await onMachine(feed, argv);
}
