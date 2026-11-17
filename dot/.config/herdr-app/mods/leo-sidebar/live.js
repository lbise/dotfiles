// What the sidebar reads besides Herdr's own lists, shared by both copies of the
// mod (agents and spaces): the machines from `hc machine ls`, and each Pi's
// state.json (docs/herdr-chat.md) read on its machine.

import { exec, hc, machines, setShared, shared } from "herdr";
import { machineState } from "./data.js";

const MACHINES_EVERY = 10000;
const PI_BUSY_EVERY = 2000; // a Pi working or asking
const PI_EVERY = 10000;
const TIMEOUT = 8000;

let known = [];
let machinesAt = 0;
let machinesBusy = false;

/** "ok", "connecting", "down" or "login" (see data.js). */
export function stateOf(machine) {
  return machineState(machine, known, machines());
}

/** The machines `hc machine ls` knows, not temporary ones. */
export const knownMachines = () => known;

const HIDDEN = "leo-sidebar.hidden";

/** Machines whose spaces and agents the sidebar leaves out; "" is this computer, hidden until shown once. */
export const hiddenMachines = () => new Set(shared(HIDDEN) ?? [""]);

export function setHidden(machine, hide) {
  const set = hiddenMachines();
  hide ? set.add(machine ?? "") : set.delete(machine ?? "");
  setShared(HIDDEN, [...set]);
}

/** The machine an address like "2-uboard311/t7" is on; null for this computer. */
export const machineOf = (address) => (address.includes("/") ? address.slice(0, address.lastIndexOf("/")) : null);

const pis = new Map(); // address -> { state, at (local ms of the read), busy, want (ms) }

/** The last state.json of a Pi terminal, or null. Asks for a read when it is old. */
export function piState(address, status) {
  let entry = pis.get(address);
  if (!entry) pis.set(address, (entry = { state: null, at: 0, busy: false }));
  entry.every = status === "working" || status === "blocked" ? PI_BUSY_EVERY : PI_EVERY;
  entry.seen = Date.now();
  return entry;
}

/** Re-reads now (an agent changed state). */
export function piStale(address) {
  const entry = pis.get(address);
  if (entry) entry.at = 0;
}

/** Starts the reads that are due. Resolves true when something changed. */
export async function poll() {
  const now = Date.now();
  const jobs = [];
  if (!machinesBusy && now - machinesAt > MACHINES_EVERY) jobs.push(readMachines());
  for (const [address, entry] of pis) {
    if (now - entry.seen > 60000) { pis.delete(address); continue; } // no card shows it any more
    if (!entry.busy && now - entry.at > entry.every) jobs.push(readPi(address, entry));
  }
  const changed = await Promise.all(jobs);
  return changed.some(Boolean);
}

async function readMachines() {
  machinesBusy = true;
  try {
    const r = await hc(["machine", "ls", "--json"]);
    if (r.code !== 0) return false;
    const next = (JSON.parse(r.stdout).machines ?? []).filter((m) => !m.temporary);
    const changed = JSON.stringify(next) !== JSON.stringify(known);
    known = next;
    return changed;
  } catch {
    return false;
  } finally {
    machinesAt = Date.now();
    machinesBusy = false;
  }
}

const READ = 'd="${XDG_STATE_HOME:-$HOME/.local/state}/herdr-chat/$1"; cat "$d/state.json"';

async function readPi(address, entry) {
  const machine = machineOf(address);
  const id = address.slice(address.lastIndexOf("/") + 1);
  // shortcut: a Pi on this computer (Windows, no sh) is not read; read it with
  // PowerShell if Pi ever runs on Windows itself.
  if (!machine || !/^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(id)) { entry.at = Date.now(); return false; }
  if (stateOf(machine) !== "ok") { entry.at = Date.now(); return false; }
  entry.busy = true;
  try {
    const r = await exec("sh", ["-c", READ, "sh", id], { on: machine, timeout: TIMEOUT });
    if (r.code !== 0) return false;
    const state = JSON.parse(r.stdout);
    if (state?.v !== 1 || state.updated === entry.state?.updated) return false;
    entry.state = state;
    return true;
  } catch {
    return false;
  } finally {
    entry.at = Date.now();
    entry.busy = false;
  }
}
