// Review comments to the tab's agent. Pi gets them as its input box's draft,
// through the herdr-chat extension's inbox (dot/.pi/agent/extensions/herdr-chat):
// the person reads them and sends them. Any other agent gets them typed and sent
// with `hc send`, which always presses Enter.

import { agents, exec, focused, hc } from "herdr";

// shortcut: the command travels as one argument (Windows caps a command line near
// 32,767 characters); chunk it as pi-chat's inboxArgvs does if reviews outgrow this.
const MAX_MESSAGE = 24000;

// $1 terminal id, $2 file name, $3 the command's JSON (one line: JSON escapes newlines).
// Written beside inbox/ and renamed in, so the extension only sees whole files.
const INBOX = [
  'd="${XDG_STATE_HOME:-$HOME/.local/state}/herdr-chat/$1";',
  'mkdir -p "$d/inbox" && printf "%s" "$3" >"$d/.inbox-$2.tmp" && mv "$d/.inbox-$2.tmp" "$d/inbox/$2.json"',
].join(" ");

/** The agent of the focused tab (the focused pane's when there are several), or null. */
export function tabAgent() {
  const focus = focused();
  if (!focus) return null;
  const mine = agents().filter((agent) => agent.tab === focus.tab);
  return mine.find((agent) => agent.pane === focus.pane) || mine[0] || null;
}

/** "Pi's input" for Pi, else "Send to <app>": what the button does. */
export function sendLabel(agent) {
  if (!agent) return "No agent in this tab";
  return agent.app === "pi" ? "Put in Pi's input" : `Send to ${agent.app || agent.title || "agent"}`;
}

/**
 * Gives `text` to `agent`. Rejects with the reason when it did not get there.
 * @param {import("herdr").AgentInfo} agent
 * @param {string} text
 */
export async function giveAgent(agent, text) {
  if (text.length > MAX_MESSAGE) throw new Error(`too long (${text.length} characters, at most ${MAX_MESSAGE}): send fewer comments at once`);
  if (agent.app !== "pi") {
    const result = await hc(["send", agent.address, text]);
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
