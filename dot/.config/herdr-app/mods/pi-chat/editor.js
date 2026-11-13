// Ctrl+G: the reply box's text in Neovim, in a dialog over the chat. Neovim runs
// in a herdr-core terminal on Pi's machine, on a file there that holds the draft;
// when it quits, the dialog closes itself and the file comes back into the box
// (:q! leaves it unchanged). One at a time per Pi: the terminal's name is taken.

import { exec, hc, openOverlay, run } from "herdr";
import { base64, utf8Bytes } from "./model/protocol.js";

const WAIT = 20; // s: one `hc wait` (the app stops an `hc` call after 30 s); the loop waits again until Neovim ends
const WRITE = 'umask 077 && printf %s "$1" | base64 -d > "$2"';
const READ = 'cat "$1" && rm -f "$1"';

async function onMachine(pi, script, ...args) {
  const result = await exec("sh", ["-c", script, "herdr-chat", ...args], { on: pi.machine });
  if (result.code !== 0) throw new Error(result.stderr.trim() || `exit ${result.code}`);
  return result.stdout;
}

/**
 * Edits `text` in Neovim on Pi's machine. Resolves with the text as Neovim left it.
 * @param {{ machine: string|null, id: string }} pi
 * @param {string} text
 */
export async function editInNeovim(pi, text) {
  const path = `/tmp/herdr-chat-${pi.id}-${Date.now()}.md`;
  await onMachine(pi, WRITE, base64(utf8Bytes(text)), path);
  // A login shell: Neovim may live in a folder only the person's profile puts on PATH.
  const where = pi.machine ? ["--on", pi.machine] : [];
  const started = await hc(["run", "--bg", "--json", ...where, "--no-parent", "--rm", "--name", `chat-edit-${pi.id}`, "sh", "-lc", 'exec nvim "$1"', "sh", path]);
  if (started.code !== 0) throw new Error(started.stderr.trim() || "could not start Neovim");
  let address = JSON.parse(started.stdout).address;
  if (pi.machine && !address.includes("/")) address = `${pi.machine}/${address}`;
  openOverlay({ kind: "dialog", modal: true, width: 0.8, height: 0.75, layout: { type: "block", content: { terminal: address } } });
  run("pane.focus", { terminal: address });
  for (;;) {
    const waited = await hc(["wait", "--json", "--timeout", String(WAIT), address]);
    if (waited.code !== 0) break; // gone: it ended and was removed
    try {
      if (JSON.parse(waited.stdout).ended) break;
    } catch {
      break;
    }
  }
  // Neovim ends a file with a line break the person did not type; blank lines at the end go too.
  return (await onMachine(pi, READ, path)).replace(/\n+$/, "");
}
