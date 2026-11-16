// The changed files, from git's -z outputs, and the review comments as one message.
// Plain JS, no Herdr imports: node runs its tests.

/**
 * @typedef {{ path: string, old: string, status: "A"|"M"|"D"|"R"|"U", add: number, del: number, binary: boolean, fresh: boolean }} FileEntry
 *   `old`: the path before (a rename's), else `path`. `fresh`: untracked.
 */

export const MAX_FILES = 1000;

/**
 * Files from `git diff <from> --name-status -z -M`, `--numstat -z -M` and `git ls-files --others -z`.
 * @returns {{ files: FileEntry[], limited: boolean }}
 */
export function parseFiles(nameStatus, numstat, untracked) {
  const stats = {};
  const num = numstat.split("\0");
  for (let i = 0; i < num.length; i++) {
    const [add, del, path] = num[i].split("\t");
    if (del === undefined) continue;
    // A rename: an empty path, then the old and the new path as their own fields.
    const target = path ? path : (i += 2, num[i]);
    stats[target] = { add: Number(add) || 0, del: Number(del) || 0, binary: add === "-" };
  }
  const files = [];
  const parts = nameStatus.split("\0");
  for (let i = 0; i + 1 < parts.length; i++) {
    const code = parts[i];
    if (!code) continue;
    let old = parts[++i], path = old;
    if (code[0] === "R" || code[0] === "C") path = parts[++i];
    const status = code[0] === "U" ? "U" : code[0] === "D" ? "D" : code[0] === "A" || code[0] === "C" ? "A" : code[0] === "R" ? "R" : "M";
    files.push({ path, old: code[0] === "C" ? path : old, status, ...(stats[path] || { add: 0, del: 0, binary: false }), fresh: false });
  }
  for (const path of untracked.split("\0").filter(Boolean)) files.push({ path, old: path, status: "A", add: 0, del: 0, binary: false, fresh: true });
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files: files.slice(0, MAX_FILES), limited: files.length > MAX_FILES };
}

/**
 * @typedef {{ path: string, side: "old"|"new", from: number, to: number, excerpt: string[], text: string }} Comment
 *   Lines from..to of one side; `excerpt`: the diff lines, signed.
 */

/**
 * The comments as one message to an agent.
 * @param {Comment[]} comments
 */
export function commentMessage(comments) {
  const parts = ["Review comments on the current changes. Address each one:"];
  comments.forEach((comment, index) => {
    const lines = comment.from === comment.to ? `${comment.from}` : `${comment.from}-${comment.to}`;
    const where = `${comment.path}:${lines}${comment.side === "old" ? " (removed lines)" : ""}`;
    parts.push(`${index + 1}. ${where}\n\`\`\`diff\n${comment.excerpt.join("\n")}\n\`\`\`\n${comment.text.trim()}`);
  });
  return parts.join("\n\n");
}
