// One feed per Pi terminal: its conversation, as last read from its machine.
// Plain data shared by every copy of the mod; the copies' timers drive the reads.

import { exec } from "herdr";
import { chatPollArgv, chatReceive, createChat } from "./model/chat.js";
import { parseCommands, parseModels, parseSessions, parseTree } from "./model/lists.js";
import { inboxArgvs, listArgv, readArgv } from "./model/protocol.js";

const TIMEOUT = 8000;
const LIST_TIMEOUT = 12000; // Pi has 5 s to answer a list request
const KEPT = 8;
// After this many failed reads in a row the machine counts as not answering.
const SILENT_AFTER = 2;
// A read still out this long after it started never comes back (seen after the
// laptop slept): it counts as failed and the next read may start.
const STUCK_AFTER = TIMEOUT + 4000;

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
      read: null, // the read out now: one that ends after it was given up does nothing
      readAt: 0,
      changedAt: 0, // when a read last brought something new, on this machine's clock
      commands: [], // Pi's slash commands, from commands.json
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

async function onMachine(feed, argv, timeout = TIMEOUT) {
  const result = await exec(argv[0], argv.slice(1), { on: feed.machine, timeout });
  if (result.code !== 0) throw new Error(result.stderr.trim() || `exit ${result.code}`);
  return result.stdout;
}

/** No read is out, or the one out is given up. */
export function feedFree(feed) {
  return !feed.busy || Date.now() - feed.readAt > STUCK_AFTER;
}

/** Reads the feed once. Resolves true when what the chat shows changed. */
export async function readFeed(feed) {
  if (!feedFree(feed)) return false;
  if (feed.busy) feed.failures++; // the read given up
  const read = (feed.read = {});
  feed.busy = true;
  feed.readAt = Date.now();
  const before = signature(feed);
  try {
    const stdout = await onMachine(feed, chatPollArgv(feed.chat, feed.id));
    if (feed.read !== read) return false;
    chatReceive(feed.chat, stdout);
    feed.reads++;
    feed.failures = 0;
  } catch {
    if (feed.read !== read) return false;
    feed.failures++;
  } finally {
    if (feed.read === read) feed.busy = false;
  }
  if (signature(feed) === before) return false;
  feed.changedAt = Date.now();
  return true;
}

/** Drops one command into the feed's inbox. Rejects when it did not get there. */
export async function sendCommand(feed, command) {
  for (const argv of inboxArgvs(feed.id, command)) await onMachine(feed, argv);
}

/** Reads Pi's slash commands into `feed.commands`. Resolves true when they changed. */
export async function readCommands(feed) {
  const commands = parseCommands(await onMachine(feed, readArgv(feed.id, "commands.json")).catch(() => ""));
  if (!commands || JSON.stringify(commands) === JSON.stringify(feed.commands)) return false;
  feed.commands = commands;
  return true;
}

/**
 * Asks Pi for its sessions or its tree. Resolves with the rows; rejects when Pi
 * did not answer (an older extension) or the machine did not.
 * @param {"sessions"|"tree"|"models"} what
 */
export async function askList(feed, what) {
  const text = await onMachine(feed, listArgv(feed.id, what), LIST_TIMEOUT);
  const rows = { sessions: parseSessions, tree: parseTree, models: parseModels }[what](text);
  if (!rows) throw new Error(`unreadable ${what}`);
  return rows;
}
