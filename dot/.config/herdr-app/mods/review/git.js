// The repo under the focused pane, and what the review reads from it with git.
// Reads write nothing under .git (no index refresh or lock, no fsmonitor cookie):
// the folder watch would see it, and every refresh would start the next one.

import { exec, focused, panes, readTextFile, spaces } from "herdr";
import { parseFiles } from "./files.js";
import { linesOf } from "./patch.js";

const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false"];
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const DIFF = ["--no-ext-diff", "--no-textconv", "--no-color", "-M"];
export const MAX_TEXT = 400000; // characters of a whole file to highlight; past this, the hunks alone

/** Where the focused pane is: its folder and machine. */
export function location() {
  const space = spaces().find((s) => s.active);
  const f = focused();
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : (space?.machine ?? null);
  return { cwd: pane?.cwd || f?.cwd || space?.folder || null, on };
}

/** git in `root` on `on`; rejects with git's message on failure. */
export async function git(repo, args, { ok = [0] } = {}) {
  const result = await exec("git", [...READ, ...args], { cwd: repo.root, on: repo.on, timeout: 60000 });
  if (!ok.includes(result.code)) throw new Error((result.stderr || result.stdout).trim() || `git ${args[0]}: exit ${result.code}`);
  return result.stdout;
}

/** The repo at `cwd`, or null when it is not in one. */
export async function findRepo(cwd, on) {
  const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on });
  if (top.code !== 0) return null;
  const repo = { root: top.stdout.trim(), on };
  const branch = await exec("git", ["branch", "--show-current"], { cwd: repo.root, on });
  repo.branch = branch.stdout.trim() || "detached";
  return repo;
}

/** The base branch a branch review compares with: origin's default, else main or master. */
export async function defaultBase(repo) {
  const head = await exec("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], { cwd: repo.root, on: repo.on });
  if (head.code === 0 && head.stdout.trim()) return head.stdout.trim();
  for (const name of ["origin/main", "origin/master", "main", "master"])
    if ((await exec("git", ["rev-parse", "--verify", "--quiet", name], { cwd: repo.root, on: repo.on })).code === 0) return name;
  return "main";
}

/** Branches to pick a base from, most recent first. */
export async function branches(repo) {
  const out = await git(repo, ["for-each-ref", "--sort=-committerdate", "--count=40", "--format=%(refname:short)", "refs/heads", "refs/remotes"]);
  return out.split("\n").filter((name) => name && !name.endsWith("/HEAD"));
}

/**
 * What the worktree is compared with: HEAD (uncommitted changes), or where the branch left `base`.
 * @returns {Promise<string>} A commit or tree.
 */
export async function compareFrom(repo, mode, base) {
  if (mode === "branch") {
    const out = await exec("git", ["merge-base", base, "HEAD"], { cwd: repo.root, on: repo.on });
    if (out.code !== 0) throw new Error(`no common commit with ${base}`);
    return out.stdout.trim();
  }
  const head = await exec("git", ["rev-parse", "--verify", "--quiet", "HEAD"], { cwd: repo.root, on: repo.on });
  return head.code === 0 ? "HEAD" : EMPTY_TREE;
}

/** The changed files between `from` and the worktree, untracked ones included. */
export async function changedFiles(repo, from) {
  const [names, stats, untracked] = await Promise.all([
    git(repo, ["diff", from, "--name-status", "-z", "-M"]),
    git(repo, ["diff", from, "--numstat", "-z", "-M"]),
    git(repo, ["ls-files", "--others", "--exclude-standard", "-z"]),
  ]);
  return parseFiles(names, stats, untracked);
}

/**
 * One file's diff and its two sides' text (null where there is none, or too much to highlight).
 * @param {import("./files.js").FileEntry} file
 */
export async function fileDiff(repo, from, file) {
  const patch = file.fresh
    ? await git(repo, ["diff", "--no-index", ...DIFF, "--", "/dev/null", file.path], { ok: [0, 1] })
    : await git(repo, ["diff", from, ...DIFF, "--", ...(file.old === file.path ? [file.path] : [file.old, file.path])]);
  const before = file.status === "A" ? "" : await git(repo, ["show", `${from}:${file.old}`]).catch(() => null);
  const after = file.status === "D" ? "" : await readTextFile(`${repo.root}/${file.path}`, { on: repo.on }).catch(() => null);
  const usable = (text) => (text === null || text.length > MAX_TEXT || text.includes("\0") ? null : linesOf(text));
  return { patch, oldLines: usable(before), newLines: usable(after) };
}

// The commit runs in the person's interactive shell, as in a terminal: herdr-core starts programs
// without the shell's setup, so an SSH agent set up there (SSH_AUTH_SOCK) is missing, and a signed
// commit (gpg.format ssh) fails. $1 the script, $2 the message (its $1 in there).
const IN_SHELL = 'exec "${SHELL:-/bin/sh}" -ic "$1" herdr-review "$2"';
const COMMIT = 'git add -A && git commit -m "$1"';

/** `git add -A` and commit; rejects with git's message. */
export async function commitAll(repo, message) {
  const result = await exec("sh", ["-c", IN_SHELL, "sh", COMMIT, message], { cwd: repo.root, on: repo.on, timeout: 60000 });
  if (result.code === 0) return;
  // An interactive shell writing to no terminal also prints title escapes and complaints about
  // its line editor: keep git's own lines.
  const text = `${result.stderr}\n${result.stdout}`
    .replace(/\x1b\][^\x07]*\x07|\x1b\[[0-9;?]*[A-Za-z]/g, "")
    .split("\n")
    .filter((line) => line.trim() && !/can't change option: zle|no job control|cannot set terminal process group|Inappropriate ioctl/.test(line))
    .join("\n");
  throw new Error(text.trim() || `exit ${result.code}`);
}
