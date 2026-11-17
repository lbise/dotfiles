// Pure helpers of the sidebar: what a machine's state means, how agents are
// ordered and named, what a Pi turn reads as. No herdr imports, so node can test it.

// Most urgent first. Done and idle agents are free for work, so they come before
// the busy ones.
export const ORDER = ["blocked", "done", "idle", "working"];
export const SECTION = { blocked: "Needs you", done: "Done", idle: "Idle", working: "Working" };

/**
 * "ok", "connecting", "down" or "login" for a space's machine (null: this computer).
 * `known`: `hc machine ls` machines; `layouts`: the app's `machines()`.
 */
export function machineState(name, known, layouts) {
  if (!name) return "ok";
  const m = known.find((k) => k.name === name);
  const layout = layouts.find((k) => k.name === name)?.layout;
  if (m?.state === "needs_login") return "login";
  if (m && m.state !== "connected") return m.state === "connecting" ? "connecting" : "down";
  if (layout === "loading") return "connecting";
  if (layout === "unavailable") return "down";
  return "ok";
}

/** How a machine reads on a card: "2-uboard311" as "uboard311" (the number only orders them). */
export const machineLabel = (name) => String(name ?? "").replace(/^\d+-/, "");

/** Agents in display order: by ORDER, then most recently changed first. `since(a)`: ms. */
export function ordered(list, since) {
  const rank = (a) => { const i = ORDER.indexOf(a.status); return i < 0 ? ORDER.length : i; };
  return [...list].sort((x, y) => rank(x) - rank(y) || since(y) - since(x) || y.seq - x.seq);
}

// Same as the agents mod: drops a status glyph or spinner, keeps a leading bracket or quote.
const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}\p{Ps}\p{Pi}]+/u, "").replace(/^\[ [!.] \] /, "").trim();

/**
 * What a card calls an agent: Pi's session name, a tab someone named, the
 * terminal's own title when it says something, else its space.
 */
export function agentName(a, piTitle, tabNamed) {
  if (piTitle) return piTitle;
  if (tabNamed && a.tab_name) return a.tab_name;
  const live = clean(a.title);
  const prog = a.program?.name;
  const key = a.program?.key;
  // clean() would strip a path's leading ~ or /: test the title with only its status glyph gone.
  const path = /^[~/]|^[A-Za-z]:\\/.test((a.title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, ""));
  const telling = live && live !== prog && !path && !live.includes("@")
    && live.toLowerCase() !== key && !/^π(\s|$)/.test(live);
  return telling ? live : a.space_name || prog || a.address;
}

const VERB = { look: "Reading", run: "Running", edit: "Editing" };

/** The running step of a Pi turn as "Running" and its label, or null. */
export function current(turn) {
  const step = turn?.steps?.findLast?.((s) => s.endedAt == null) ?? null;
  return step ? { verb: VERB[step.kind] ?? "Working", label: step.label } : null;
}

/** 45s, 6m, 6m 20s, 1h 5m: a turn's length. */
export function span(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m}m ${s % 60}s` : `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** <1m, 6m, 2h, 3d: how long ago. */
export function ago(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}
