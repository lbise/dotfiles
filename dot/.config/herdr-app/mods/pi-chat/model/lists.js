// What Pi lists for the chat: its sessions and its tree (on request), its slash
// commands (once per session); checked, and filtered for the pickers and the slash menu.

/**
 * @typedef {object} SessionItem One line of sessions.json.
 * @property {string} path
 * @property {string} title
 * @property {string} cwd
 * @property {number|null} modified Epoch ms.
 * @property {number|null} messages
 * @property {boolean} current
 *
 * @typedef {object} TreeRow One of the user's messages in tree.json, ready to draw.
 * @property {string} id
 * @property {string|null} parentId
 * @property {string} text
 * @property {number|null} timestamp
 * @property {boolean} active On the branch Pi is on.
 * @property {string|null} label
 * @property {number} depth How far it is indented: one more under each fork.
 * @property {boolean} current The last message of yours on the active branch: where the conversation is.
 *
 * @typedef {object} SlashItem
 * @property {string} name Without the slash.
 * @property {string} description
 * @property {"session"|"skill"|"prompt"|"command"} kind `session`: run by the chat itself.
 */

/** Pi's session commands, which the chat runs itself (Pi does not take them as a prompt). */
export const SESSION_COMMANDS = [
  { name: "new", description: "Start a new session", kind: "session" },
  { name: "compact", description: "Summarize the conversation to free context", kind: "session" },
  { name: "resume", description: "Open another session of this folder", kind: "session" },
  { name: "tree", description: "Go back to an earlier message", kind: "session" },
  { name: "reload", description: "Reload extensions, skills, prompts and settings", kind: "session" },
];

const KINDS = ["skill", "prompt", "command"];
const str = (value) => (typeof value === "string" ? value : "");
const num = (value) => (Number.isFinite(value) ? value : null);

/** @param {string} text */
function parsed(text) {
  try {
    const data = JSON.parse(text);
    return data && typeof data === "object" && data.v === 1 && Array.isArray(data.items || data.commands) ? data : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} text sessions.json
 * @returns {SessionItem[]|null} Null when it is not a version 1 file.
 */
export function parseSessions(text) {
  const data = parsed(text);
  if (!data || !Array.isArray(data.items)) return null;
  return data.items
    .filter((item) => item && typeof item.path === "string" && item.path)
    .map((item) => ({
      path: item.path,
      title: str(item.title).replace(/\s+/g, " ").trim(),
      cwd: str(item.cwd),
      modified: num(item.modified),
      messages: num(item.messages),
      current: item.current === true,
    }));
}

/**
 * @param {string} text models.json
 * @returns {{ provider: string, id: string, name: string, scoped: boolean, current: boolean }[]|null} Null when it is not a version 1 file.
 */
export function parseModels(text) {
  const data = parsed(text);
  if (!data || !Array.isArray(data.items)) return null;
  return data.items
    .filter((item) => item && typeof item.provider === "string" && typeof item.id === "string" && item.id)
    .map((item) => ({ provider: item.provider, id: item.id, name: str(item.name) || item.id, scoped: item.scoped === true, current: item.current === true }));
}

/**
 * The user's messages of tree.json, each under the nearest one above it.
 * @param {string} text tree.json
 * @returns {TreeRow[]|null} In tree order. Null when it is not a version 1 file.
 */
export function parseTree(text) {
  const data = parsed(text);
  if (!data || !Array.isArray(data.items)) return null;
  const all = data.items.filter((item) => item && typeof item.id === "string" && item.id);
  const byId = new Map(all.map((item) => [item.id, item]));
  const userAbove = (item) => {
    const seen = new Set();
    for (let id = item.parentId; byId.has(id) && !seen.has(id); id = byId.get(id).parentId) {
      seen.add(id);
      if (byId.get(id).role === "user") return id;
    }
    return null;
  };
  const items = all.filter((item) => item.role === "user").map((item) => ({ ...item, parentId: userAbove(item) }));
  const children = new Map();
  for (const item of items) children.set(item.parentId, (children.get(item.parentId) || 0) + 1);
  const depths = new Map();
  const rows = items.map((item) => {
    const fork = (children.get(item.parentId) || 0) > 1;
    const depth = (item.parentId === null ? 0 : depths.get(item.parentId) ?? 0) + (fork ? 1 : 0);
    depths.set(item.id, depth);
    return {
      id: item.id,
      parentId: item.parentId,
      text: str(item.text).replace(/\s+/g, " ").trim(),
      timestamp: num(item.timestamp),
      active: item.active === true,
      label: str(item.label) || null,
      depth,
      current: false,
    };
  });
  const current = rows.filter((row) => row.active).pop();
  if (current) current.current = true;
  return rows;
}

/**
 * @param {string} text commands.json
 * @returns {SlashItem[]|null} Null when it is not a version 1 file.
 */
export function parseCommands(text) {
  const data = parsed(text);
  if (!data || !Array.isArray(data.commands)) return null;
  return data.commands
    .filter((command) => command && typeof command.name === "string" && command.name)
    .map((command) => ({
      name: command.name.replace(/^\//, ""),
      description: str(command.description).replace(/\s+/g, " ").trim(),
      kind: KINDS.includes(command.kind) ? command.kind : "command",
    }));
}

/**
 * True when every word of `query` is in one of `fields`, ignoring case.
 * @param {string} query
 * @param {string[]} fields
 */
export function matches(query, fields) {
  const text = fields.join("\n").toLowerCase();
  return query.toLowerCase().split(/\s+/).every((word) => text.includes(word));
}

/**
 * The slash menu for what follows the slash: the session commands, then Pi's;
 * names that start with the query first, then names that hold it, then descriptions
 * (from two letters on).
 * @param {string} query
 * @param {SlashItem[]} commands From commands.json.
 * @returns {SlashItem[]}
 */
export function slashItems(query, commands) {
  const q = query.toLowerCase();
  const all = [...SESSION_COMMANDS, ...commands];
  const rank = (item) => {
    const name = item.name.toLowerCase();
    if (name.startsWith(q) || name.split(":").some((part) => part.startsWith(q))) return 0;
    if (name.includes(q)) return 1;
    // One letter would match most descriptions.
    return q.length > 1 && item.description.toLowerCase().includes(q) ? 2 : -1;
  };
  const ranked = all.map((item, index) => ({ item, index, rank: rank(item) })).filter((entry) => entry.rank >= 0);
  ranked.sort((a, b) => a.rank - b.rank || a.index - b.index);
  return ranked.map((entry) => entry.item);
}

/**
 * The session command a reply is, or null: "/new", "/compact [instructions]", "/resume", "/tree", "/reload".
 * @param {string} text
 * @returns {{ action: "new"|"compact"|"resume"|"tree"|"reload", instructions: string }|null}
 */
export function sessionCommand(text) {
  const match = /^\/(new|compact|resume|tree|reload)(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!match) return null;
  const instructions = (match[2] || "").trim();
  if (instructions && match[1] !== "compact") return null;
  return { action: /** @type {"new"|"compact"|"resume"|"tree"|"reload"} */ (match[1]), instructions };
}
