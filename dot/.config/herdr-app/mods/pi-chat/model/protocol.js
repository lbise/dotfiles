// The file protocol of docs/herdr-chat.md, seen from the mod: the command that
// reads one poll, the parser for what it prints, the byte cursor into the session
// file, and the commands that drop a file into inbox/.
//
// Plain ES2020: the mod's engine has no Buffer, TextEncoder or btoa.

/**
 * @typedef {object} Cursor Where the next poll resumes.
 * @property {string|null} sessionFile The session file being followed.
 * @property {number} offset Bytes of it consumed: always the start of a line.
 * @property {boolean} truncated The first read skipped the start of a large file.
 *
 * @typedef {object} PollFile
 * @property {string} path The session file the command read.
 * @property {number} start Byte offset where `chunk` begins.
 * @property {number} size The file's size when it was read.
 *
 * @typedef {object} LiveStep A tool call as state.json reports it.
 * @property {string} id
 * @property {"look"|"run"|"edit"|"other"} kind
 * @property {string} name
 * @property {string} label
 * @property {number} startedAt Epoch ms.
 * @property {number} [endedAt] Absent while it runs.
 * @property {boolean} [ok] Absent while it runs.
 *
 * @typedef {object} LiveTask A running subagent as state.json reports it.
 * @property {string} id The delegate tool call that started it.
 * @property {boolean} background
 * @property {number} startedAt Epoch ms.
 * @property {string|null} taskId
 * @property {string} title
 * @property {string} agent
 * @property {string} status "queued" or "running".
 * @property {string|null} sessionPath
 * @property {string|null} currentTool
 * @property {string|null} model
 * @property {number} turns
 * @property {number} tokens
 * @property {number} cost
 *
 * @typedef {object} ModelRef
 * @property {string} provider
 * @property {string} id
 * @property {string} name
 *
 * @typedef {object} State state.json, version 1 (docs/herdr-chat.md).
 * @property {1} v
 * @property {number} pid
 * @property {number} updated Epoch ms on the agent's machine.
 * @property {string|null} sessionFile
 * @property {string} sessionId
 * @property {string|null} title
 * @property {string} cwd
 * @property {"idle"|"working"|"asking"|"compacting"} status
 * @property {number} entries
 * @property {ModelRef|null} model
 * @property {string} thinking
 * @property {ModelRef[]} models
 * @property {string[]} thinkingLevels
 * @property {{ tokens: number, window: number|null }|null} context
 * @property {number|null} cost
 * @property {{ root: string, branch: string }|null} git
 * @property {Array<{ key: string, text: string, label?: string, percent?: number, resets?: string }>} usage
 * @property {{ startedAt: number, endedAt: number|null, steps: LiveStep[] }|null} turn
 * @property {LiveTask[]} [tasks] Running subagents; absent from an older extension.
 * @property {{ text: string, thinking: boolean }|null} stream
 * @property {{ id: string, question: string, options: Array<{ label: string, description?: string }>, multi: boolean }|null} ask
 * @property {string} draft
 * @property {string|null} error
 *
 * @typedef {object} Poll
 * @property {State|null} state The parsed state.json, or null.
 * @property {null|"missing"|"garbled"|"version"} problem Why `state` is null.
 * @property {PollFile|null} file Null when there is no readable session file.
 * @property {string} chunk The session file from `file.start`.
 * @property {boolean} complete False when the output was cut short.
 */

const RS = "\x1e"; // record separator: cannot occur raw in JSON
const FIRST_READ = 2097152; // a first read takes the last 2 MB
const B64_PER_COMMAND = 12000; // keeps one command line far below Windows' 32,767 characters
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const STATE_DIR = 'd="${XDG_STATE_HOME:-$HOME/.local/state}/herdr-chat/$1"';

// The scripts are written one statement per line and joined into a single line, so
// they survive a transport that dislikes newlines inside an argument.
const oneLine = (/** @type {string[]} */ lines) => lines.join(" ");

// $1 terminal id, $2 last known session file, $3 bytes of it already consumed,
// $4 the session file to read instead of state.json's (a subagent's), or empty.
// Prints: state.json, RS, "<start> <size> <path>" or an empty line, the session
// file from <start>, RS.
// It starts over (from 0, or from the first line start in the last 2 MB) when the
// file is not the known one, is shorter than the offset, or the offset is not at
// a line start (the byte before it must be a newline).
// shortcut: sessionFile is cut out of state.json with sed, so a path containing a
// JSON escape (quote, backslash) reads as "no session file"; parse it properly
// (jq or node on the agent's machine) if such a path ever exists.
const POLL_SCRIPT = oneLine([
  `${STATE_DIR};`,
  `s=$(cat "$d/state.json" 2>/dev/null);`,
  `printf '%s\\036' "$s";`,
  `if [ -n "$4" ]; then f=$4; else`,
  `f=$(printf '%s' "$s" | sed -n 's/.*"sessionFile"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' | head -n 1);`,
  `fi;`,
  `if [ -n "$f" ] && [ -r "$f" ]; then`,
  `n=$(($(wc -c <"$f")));`,
  `o=$3;`,
  `if [ "$f" != "$2" ] || [ "$o" -le 0 ] || [ "$o" -gt "$n" ] || [ -n "$(tail -c +"$o" "$f" | head -c 1)" ]; then`,
  `o=0;`,
  `if [ "$n" -gt ${FIRST_READ} ]; then`,
  `o=$((n - ${FIRST_READ}));`,
  `o=$((o + $(tail -c +$((o + 1)) "$f" | head -n 1 | wc -c)));`,
  `fi;`,
  `fi;`,
  `printf '%s %s %s\\n' "$o" "$n" "$f";`,
  `tail -c +$((o + 1)) "$f";`,
  `else`,
  `echo;`,
  `fi;`,
  `printf '\\036'`,
]);

// $1 terminal id, $2 file name without ".json", $3 a piece of base64, $4 "end" on the last piece.
// The pieces collect beside inbox/, so the extension only ever sees the renamed file.
const INBOX_SCRIPT = oneLine([
  `${STATE_DIR};`,
  `t="$d/.inbox-$2";`,
  `mkdir -p "$d/inbox" && printf '%s' "$3" >>"$t.b64" || exit 1;`,
  `[ "$4" = end ] || exit 0;`,
  `base64 -d <"$t.b64" >"$t.tmp" && mv "$t.tmp" "$d/inbox/$2.json";`,
  `r=$?;`,
  `rm -f "$t.b64" "$t.tmp";`,
  `exit $r`,
]);

// $1 terminal id, $2 file name without ".json", $3 the command as base64, $4 the file the command makes Pi write.
// Drops the command into inbox/, then prints that file once it changed; exits 3 when it did not within 5 s.
const ASK_SCRIPT = oneLine([
  `${STATE_DIR};`,
  `f="$d/$4";`,
  `o=$(cksum <"$f" 2>/dev/null);`,
  `t="$d/.inbox-$2";`,
  `mkdir -p "$d/inbox" && printf '%s' "$3" | base64 -d >"$t.tmp" && mv "$t.tmp" "$d/inbox/$2.json" || { rm -f "$t.tmp"; exit 1; };`,
  `i=0;`,
  `while [ $i -lt 25 ]; do`,
  `sleep 0.2;`,
  `n=$(cksum <"$f" 2>/dev/null);`,
  `if [ -n "$n" ] && [ "$n" != "$o" ]; then cat "$f"; exit 0; fi;`,
  `i=$((i + 1));`,
  `done;`,
  `exit 3`,
]);

// $1 terminal id, $2 a file of the state directory.
const READ_SCRIPT = `${STATE_DIR}; cat "$d/$2"`;

const ANSWERS = { sessions: "sessions.json", tree: "tree.json", models: "models.json" };

/**
 * Splits a terminal address: "1-wsl/t7" is machine "1-wsl", id "t7".
 * @param {string} address
 * @returns {{ machine: string|null, id: string }}
 */
export function splitAddress(address) {
  const text = String(address);
  const slash = text.lastIndexOf("/");
  return { machine: slash < 0 ? null : text.slice(0, slash), id: text.slice(slash + 1) };
}

/** @param {string} terminalId */
function checkedId(terminalId) {
  const id = String(terminalId);
  // It becomes a directory name on the agent's machine.
  if (!/^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(id)) throw new Error(`bad terminal id: ${id}`);
  return id;
}

/** @returns {Cursor} */
export function createCursor() {
  return { sessionFile: null, offset: 0, truncated: false };
}

/**
 * The argv of one poll: `exec(argv[0], argv.slice(1), { on: machine })`.
 * @param {string} terminalId
 * @param {Cursor} [cursor]
 * @param {string|null} [file] A subagent's session file to read instead of Pi's own (see isChildSession).
 * @returns {string[]}
 */
export function pollArgv(terminalId, cursor = createCursor(), file = null) {
  const offset = Number.isFinite(cursor.offset) ? Math.max(0, Math.floor(cursor.offset)) : 0;
  if (file !== null && !sessionPath(file)) throw new Error(`bad session file: ${file}`);
  return ["sh", "-c", POLL_SCRIPT, "herdr-chat", checkedId(terminalId), cursor.sessionFile || "", String(offset), file || ""];
}

/** @param {unknown} path An absolute `.jsonl` path without `..` or control characters. */
function sessionPath(path) {
  return typeof path === "string" && /^\/[^\0-\x1f]*\.jsonl$/.test(path) && !path.split("/").includes("..");
}

/** @param {string} path */
const folderOf = (path) => path.slice(0, path.lastIndexOf("/"));

/**
 * True when `path` may be read as one of Pi's subagents: a session file beside Pi's
 * own, which is where the delegate extension saves them. The path comes from files
 * on the agent's machine, so it is checked before it is read.
 * @param {State|null} state
 * @param {unknown} path
 */
export function isChildSession(state, path) {
  const own = state && state.sessionFile;
  return sessionPath(path) && sessionPath(own) && path !== own && folderOf(/** @type {string} */ (path)) === folderOf(/** @type {string} */ (own));
}

/**
 * Parses what the poll command printed. Never throws.
 * @param {string} stdout
 * @returns {Poll}
 */
export function parsePoll(stdout) {
  const out = typeof stdout === "string" ? stdout : "";
  const first = out.indexOf(RS);
  const stateText = (first < 0 ? out : out.slice(0, first)).trim();
  let state = null;
  /** @type {Poll["problem"]} */
  let problem = stateText ? null : "missing";
  if (stateText) {
    try {
      state = JSON.parse(stateText);
    } catch {
      state = null;
    }
    if (!state || typeof state !== "object" || Array.isArray(state)) problem = "garbled";
    else if (state.v !== 1) problem = "version";
    if (problem) state = null;
  }

  const last = out.lastIndexOf(RS);
  const complete = first >= 0 && last > first;
  const end = complete ? last : out.length;
  const newline = first < 0 ? -1 : out.indexOf("\n", first + 1);
  let file = null;
  let chunk = "";
  if (newline >= 0 && newline < end) {
    const meta = /^(\d+) (\d+) (.+)$/.exec(out.slice(first + 1, newline));
    if (meta) {
      file = { start: Number(meta[1]), size: Number(meta[2]), path: meta[3] };
      chunk = out.slice(newline + 1, end);
    }
  }
  return { state, problem, file, chunk, complete };
}

/**
 * Moves the cursor over one poll and hands back the complete lines it read.
 * An unfinished last line is not consumed: the offset stays at its start, so the
 * next poll fetches it whole (it may have been cut inside a character).
 * `reset` is true when the lines do not continue what was read before (another
 * session file, or the file started over): throw the old transcript away.
 * @param {Cursor} cursor
 * @param {Poll} poll
 * @returns {{ cursor: Cursor, lines: string[], reset: boolean }}
 */
export function advance(cursor, poll) {
  const file = poll.file;
  if (!file) {
    // No readable file: follow the state to a new or ephemeral session.
    const path = poll.state ? poll.state.sessionFile || null : cursor.sessionFile;
    if (path === cursor.sessionFile) return { cursor, lines: [], reset: false };
    return { cursor: { sessionFile: path, offset: 0, truncated: false }, lines: [], reset: true };
  }
  const reset = file.path !== cursor.sessionFile || file.start !== cursor.offset;
  const whole = poll.chunk.slice(0, poll.chunk.lastIndexOf("\n") + 1);
  return {
    cursor: {
      sessionFile: file.path,
      offset: file.start + utf8Length(whole),
      truncated: reset ? file.start > 0 : cursor.truncated,
    },
    lines: whole ? whole.slice(0, -1).split("\n") : [],
    reset,
  };
}

/**
 * The commands that drop one command file into inbox/, to run in order; stop at
 * the first that exits non-zero. One command unless the JSON is large.
 * @param {string} terminalId
 * @param {{ type: string }} command One of the inbox commands of docs/herdr-chat.md.
 * @param {{ now?: number, random?: number }} [options] For tests.
 * @returns {string[][]}
 */
export function inboxArgvs(terminalId, command, options = {}) {
  if (!command || typeof command.type !== "string") throw new Error("inbox command needs a type");
  const id = checkedId(terminalId);
  const now = options.now === undefined ? Date.now() : options.now;
  const random = options.random === undefined ? Math.random() : options.random;
  const tag = Math.floor(random * 36 ** 6).toString(36).padStart(6, "0");
  const name = `${now}-${tag}`;
  const data = base64(utf8Bytes(JSON.stringify(command)));
  const argvs = [];
  for (let at = 0; at < data.length; at += B64_PER_COMMAND) {
    const end = at + B64_PER_COMMAND >= data.length ? "end" : "more";
    argvs.push(["sh", "-c", INBOX_SCRIPT, "herdr-chat", id, name, data.slice(at, at + B64_PER_COMMAND), end]);
  }
  return argvs;
}

/**
 * The command that asks Pi for a list (`list` inbox command) and prints the
 * file Pi writes in answer: exit 0 with the file, 3 when Pi did not answer in time.
 * @param {string} terminalId
 * @param {"sessions"|"tree"} what
 * @param {{ now?: number, random?: number }} [options] For tests.
 * @returns {string[]}
 */
export function listArgv(terminalId, what, options = {}) {
  if (!ANSWERS[what]) throw new Error(`no such list: ${what}`);
  const [argv] = inboxArgvs(terminalId, { type: "list", what }, options);
  return ["sh", "-c", ASK_SCRIPT, "herdr-chat", argv[4], argv[5], argv[6], ANSWERS[what]];
}

/**
 * The command that prints one file of the state directory (`commands.json`).
 * @param {string} terminalId
 * @param {string} name
 * @returns {string[]}
 */
export function readArgv(terminalId, name) {
  if (!/^[a-z]+\.json$/.test(name)) throw new Error(`bad state file: ${name}`);
  return ["sh", "-c", READ_SCRIPT, "herdr-chat", checkedId(terminalId), name];
}

/**
 * Bytes the string takes as UTF-8.
 * @param {string} text
 */
export function utf8Length(text) {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code < 0xdc00 && isLowSurrogate(text.charCodeAt(i + 1))) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

/** @param {number} code */
function isLowSurrogate(code) {
  return code >= 0xdc00 && code < 0xe000;
}

/**
 * The string as UTF-8 bytes; a lone surrogate becomes U+FFFD.
 * @param {string} text
 * @returns {number[]}
 */
export function utf8Bytes(text) {
  const bytes = [];
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code < 0xe000) {
      const low = text.charCodeAt(i + 1);
      if (code < 0xdc00 && isLowSurrogate(low)) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
        i++;
      } else code = 0xfffd;
    }
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
  }
  return bytes;
}

/**
 * Standard base64 of a byte array.
 * @param {number[]} bytes
 */
export function base64(bytes) {
  const out = [];
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out.push(
      B64[a >> 2],
      B64[((a & 3) << 4) | (b >> 4)],
      i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)] : "=",
      i + 2 < bytes.length ? B64[c & 63] : "="
    );
  }
  return out.join("");
}
