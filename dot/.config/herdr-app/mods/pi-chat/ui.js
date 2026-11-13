// Small parts every piece of the chat draws with.

import { svg } from "gpui-kit";
import { settings } from "herdr";

/** The font for figures. */
export const MONO = "Geist Mono";

/** The font for code: the terminals' own. */
export function codeFont() {
  return settings().font_family || MONO;
}

/** One of the mod's icons, in the surrounding text colour. */
export function icon(name, size = 15) {
  return svg(`mods/pi-chat/icons/${name}.svg`).size(size).flex_none();
}

/** `a` mixed with `b`: 0 is all `a`, 1 is all `b`. Both "#rrggbb". */
export function mix(a, b, share) {
  const channel = (hex, at) => parseInt(hex.slice(at, at + 2), 16);
  const parts = [1, 3, 5].map((at) => Math.round(channel(a, at) * (1 - share) + channel(b, at) * share));
  return `#${parts.map((part) => part.toString(16).padStart(2, "0")).join("")}`;
}

/** A folder as people write it: the home directory as "~". */
export function shortFolder(cwd) {
  return String(cwd || "").replace(/^(\/home\/[^/]+|\/Users\/[^/]+|\/root)(?=\/|$)/, "~");
}

// Between two signs a zero-width non-joiner keeps a font from merging them into
// a ligature (">=" and "->" stay as typed), as in the terminals.
const SIGNS = /([-=<>!|&+*/:.#~])(?=[-=<>!|&+*/:.#~])/g;

/** Text as typed: no ligatures. Never empty, so its line keeps its height. */
export function asTyped(text) {
  return text.replace(SIGNS, "$1\u200c") || " ";
}

/** Text for a monospaced line: tabs as spaces, no ligatures. */
export function monoLine(text) {
  return asTyped(text.replace(/\t/g, "    "));
}
