// Test helper: writes a small synthetic Pi session, line by line.
// Only the *.test.js files import it.

export const text = (value) => ({ type: "text", text: value });
export const call = (id, name, args) => ({ type: "toolCall", id, name, arguments: args });

export function session(start = Date.parse("2026-01-01T10:00:00.000Z")) {
  let count = 0;
  let clock = start;
  const s = {
    /** Every line so far, the header first. */
    lines: [JSON.stringify({ type: "session", version: 3, id: "session-1", timestamp: new Date(start).toISOString(), cwd: "/work" })],
    /** Id of the entry the next one hangs from. */
    leaf: null,
    /** Appends an entry, `ms` later than the one before; returns its id. */
    entry(fields, ms = 1000) {
      clock += ms;
      const id = `e${++count}`;
      s.lines.push(JSON.stringify({ id, parentId: s.leaf, timestamp: new Date(clock).toISOString(), ...fields }));
      s.leaf = id;
      return id;
    },
    message(message, ms) {
      return s.entry({ type: "message", message: { ...message, timestamp: clock } }, ms);
    },
    user(content, ms) {
      return s.message({ role: "user", content: typeof content === "string" ? [text(content)] : content }, ms);
    },
    assistant(content, stopReason = "stop", extra = {}, ms) {
      return s.message({ role: "assistant", content, provider: "anthropic", model: "claude-test", stopReason, ...extra }, ms);
    },
    result(toolCallId, toolName, output, extra = {}, ms) {
      return s.message({ role: "toolResult", toolCallId, toolName, content: [text(output)], isError: false, ...extra }, ms);
    },
    /** Lines added since the last call. */
    take() {
      const added = s.lines.slice(s.taken || 0);
      s.taken = s.lines.length;
      return added;
    },
  };
  return s;
}
