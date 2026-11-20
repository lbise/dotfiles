// Where a code view's long lines wrap, guessed without the font.

/** How many rows a line takes wrapped at `perLine` characters; breaks only at spaces, so it errs high. */
export function wrappedRows(line, perLine) {
  let rows = 1;
  let used = 0;
  for (const word of line.replace(/\t/g, "    ").match(/\s*\S+/g) || []) {
    if (used && used + word.length > perLine) {
      rows++;
      used = word.trimStart().length;
    } else used += word.length;
    for (; used > perLine; used -= perLine) rows++;
  }
  return rows;
}
