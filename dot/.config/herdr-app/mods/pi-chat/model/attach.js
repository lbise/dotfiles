// Files attached to a message: the images go to Pi as pictures, any other file
// as its path on Pi's machine at the end of the text.

/** What the extension sends as a picture (its IMAGE_TYPES). */
export const IMAGE = /\.(png|jpe?g|gif|webp)$/i;

/**
 * A staged file's name as the person knows it: without the `<stamp>-<n>-` the staging adds.
 * @param {string} staged
 */
export function shownName(staged) {
  return staged.replace(/^.*[\\/]/, "").replace(/^\d{8}-\d{6}-\d{3}-\d+-/, "");
}

/**
 * The prompt command for `text` and the files uploaded to Pi's machine.
 * @param {string} text
 * @param {string[]} paths Absolute, on Pi's machine.
 */
export function promptWith(text, paths) {
  const images = paths.filter((path) => IMAGE.test(path));
  const others = paths.filter((path) => !IMAGE.test(path));
  const list = others.map((path) => `- ${path}`).join("\n");
  const full = others.length ? `${text.trim()}\n\nAttached files:\n${list}`.trim() : text;
  return images.length ? { type: "prompt", text: full, images } : { type: "prompt", text: full };
}
