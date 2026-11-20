// An answer's markdown split at its fenced code blocks.

// A fence may be indented (a block inside a list item); its closing fence is
// ``` alone on a line, at any indent.
const FENCE = /(?:^|\n)([ \t]*)```([^\n`]*)\n([\s\S]*?)(?:\n[ \t]*```[ \t]*(?=\n|$)|$)/g;

/** The text split at its fenced code blocks; a fence still being written runs to the end. */
export function blocks(text) {
  const parts = [];
  let at = 0;
  for (const match of text.matchAll(FENCE)) {
    const before = text.slice(at, match.index).trim();
    if (before) parts.push({ code: false, text: before });
    const indent = match[1].length;
    const code = indent ? match[3].replace(new RegExp(`^[ \\t]{0,${indent}}`, "gm"), "") : match[3];
    parts.push({ code: true, text: code, info: match[2].trim().split(/\s+/)[0].toLowerCase() });
    at = match.index + match[0].length;
  }
  const rest = text.slice(at).trim();
  if (rest) parts.push({ code: false, text: rest });
  return parts;
}
