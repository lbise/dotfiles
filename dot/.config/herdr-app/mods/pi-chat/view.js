// Which of the two views the work area shows, and what each session last chose.
// The layout holds a stack with the chat and the tab's terminals; `layout.select`
// swaps them in place, and the terminal keeps running under either.

import { focused, layout, panes, run, setShared, shared, terminals } from "herdr";
import { splitAddress } from "./model/protocol.js";

const STACK = "chat-view";
const CHILD = { chat: "chat-panel", terminal: "terminal-panel" };
const VIEWS = "pi-chat.views";
const VIEWS_KEPT = 200;

/**
 * A pane that runs Pi, as the chat needs it; null for any other pane.
 * `key` names the session: a terminal address is reused once its terminal ends.
 */
export function piPane(pane) {
  if (!pane || pane.app !== "pi" || !pane.terminal) return null;
  const terminal = terminals().find((entry) => entry.address === pane.terminal);
  const { machine, id } = splitAddress(pane.terminal);
  return {
    address: pane.terminal,
    machine,
    id,
    pane: pane.pane,
    tab: pane.tab,
    cwd: pane.cwd || "",
    status: pane.status,
    program: pane.program,
    pid: terminal && terminal.foreground ? terminal.foreground.pid : null,
    key: `${pane.terminal}@${terminal ? terminal.created_ms : 0}`,
  };
}

/** The Pi the chat shows: the focused tab's, the focused pane's when there are several. */
export function target() {
  const focus = focused();
  if (!focus) return null;
  const mine = panes().filter((pane) => pane.tab === focus.tab && pane.app === "pi" && pane.terminal);
  return piPane(mine.find((pane) => pane.pane === focus.pane) || mine[0]);
}

function findStack(node) {
  if (!node) return null;
  if (node.id === STACK) return node;
  for (const child of node.children || []) {
    const found = findStack(child);
    if (found) return found;
  }
  return null;
}

/** "chat" or "terminal"; null in a layout without the stack. */
export function shownView() {
  const stack = findStack(layout());
  if (!stack) return null;
  return stack.active === CHILD.terminal ? "terminal" : "chat";
}

/** What the session last chose, or null when it never did. */
export function preferredView(key) {
  const views = shared(VIEWS) || {};
  return views[key] === "chat" || views[key] === "terminal" ? views[key] : null;
}

export function showView(mode) {
  if (shownView() !== mode) run("layout.select", { stack: STACK, child: CHILD[mode] });
}

/** The person's own switch: shown, and remembered for the session. The terminal gets the keyboard back. */
export function chooseView(pi, mode) {
  const views = { ...(shared(VIEWS) || {}) };
  delete views[pi.key];
  views[pi.key] = mode;
  const keys = Object.keys(views);
  for (const old of keys.slice(0, Math.max(0, keys.length - VIEWS_KEPT))) delete views[old];
  setShared(VIEWS, views);
  showView(mode);
  if (mode === "terminal") run("pane.focus", { pane: pi.pane });
}
