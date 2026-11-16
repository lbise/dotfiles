// Text for an agent of the focused space. Pi gets it as its input box's draft,
// through the herdr-chat extension's inbox (dot/.pi/agent/extensions/herdr-chat):
// the person reads it and sends it. Any other agent gets it typed and sent
// with `hc send`, which always presses Enter. With no agent, one is started.

import { agents, exec, focused, hc, knownAgents, run, spaces } from "herdr";

// shortcut: the command travels as one argument (Windows caps a command line near
// 32,767 characters); chunk it as pi-chat's inboxArgvs does if reviews outgrow this.
export const MAX_MESSAGE = 24000;

// $1 terminal id, $2 file name, $3 the command's JSON (one line: JSON escapes newlines).
// Written beside inbox/ and renamed in, so the extension only sees whole files.
const INBOX = [
  'd="${XDG_STATE_HOME:-$HOME/.local/state}/herdr-chat/$1";',
  'mkdir -p "$d/inbox" && printf "%s" "$3" >"$d/.inbox-$2.tmp" && mv "$d/.inbox-$2.tmp" "$d/inbox/$2.json"',
].join(" ");

/** The focused space, or null. */
export function focusedSpace() {
  const id = focused()?.space;
  return spaces().find((space) => space.id === id) || null;
}

/** The agents of the focused space. */
export function spaceAgents() {
  const space = focused()?.space;
  return agents().filter((agent) => agent.space === space);
}

/** Who gets it unless the person picks: the focused tab's agent (the focused pane's first), else an idle one, else the first. */
export function defaultAgent(list) {
  const focus = focused();
  const mine = list.filter((agent) => agent.tab === focus?.tab);
  return mine.find((agent) => agent.pane === focus?.pane) || mine[0] || list.find((agent) => agent.status === "idle") || list[0] || null;
}

function checkSize(text) {
  if (text.length > MAX_MESSAGE) throw new Error(`too long (${text.length} characters, at most ${MAX_MESSAGE}): send fewer comments at once`);
}

/**
 * Gives `text` to `agent`. Rejects with the reason when it did not get there.
 * `force`: type even though it is blocked (it may answer its question).
 * @param {import("herdr").AgentInfo} agent
 * @param {string} text
 */
export async function giveAgent(agent, text, force = false) {
  checkSize(text);
  if (agent.app !== "pi") {
    const result = await hc(["send", ...(force ? ["--force"] : []), agent.address, text]);
    if (result.code !== 0) throw new Error((result.stderr || result.stdout).trim() || `hc send: exit ${result.code}`);
    return;
  }
  const slash = agent.address.lastIndexOf("/");
  const machine = slash < 0 ? null : agent.address.slice(0, slash);
  const id = agent.address.slice(slash + 1);
  if (!/^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(id)) throw new Error(`bad terminal id: ${id}`);
  const name = `${Date.now()}-review`;
  const result = await exec("sh", ["-c", INBOX, "herdr-review", id, name, JSON.stringify({ type: "draft", text })], { on: machine });
  if (result.code !== 0) throw new Error(result.stderr.trim() || `exit ${result.code}`);
}

/**
 * Starts the most-used installed agent on `space`'s machine in a new tab, `text` its first message.
 * Resolves with its name; rejects when none is installed or the lookup fails.
 * @param {import("herdr").SpaceInfo} space
 */
export async function startAgent(space, text) {
  checkSize(text);
  const agent = (await knownAgents({ on: space.machine })).find((known) => known.installed);
  if (!agent) throw new Error(`No agent is installed ${space.machine ? `on ${space.machine}` : "on this machine"}. Install one first.`);
  run("tab.new", { space: space.id, argv: agent.run, task: text });
  return agent.name;
}
