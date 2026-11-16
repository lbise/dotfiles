# Code review in the Herdr app

Status: done (2026-11-16). Tickets in `issues/`. See ## Comments.

## Problem

The shipped `changes` mod (the Changes panel in `layouts/leo.json`'s `panel` stack) gives a quick
look at the changes, but you can't review code in it:

- It lives in a side column of 280 to 900 px and can't be maximized.
- Rows are plain text: no syntax colours and no word-level change highlight. Long lines are
  truncated, and a diff stops at 1500 lines.
- It only diffs the working tree against `HEAD`. It can't review a branch against its base, which is
  how you review an agent's finished work.
- Shipped mods are read-only. A `mod.clone` never gets updates.

Goal: do a whole code review in the Herdr app, in a new mod, `review`, that replaces the Changes panel.

## Decisions

- **A separate mod, `mods/review/`.** Chat and review are different things, so this mod doesn't touch
  pi-chat's code.
- **It replaces the shipped Changes panel.** In `layouts/leo.json` the `panel-body` block with id
  `changes` gets `"mod": "review"`. Its id stays `changes`, so the tab bar's Changes button (the
  shipped `tabs` mod selects stack child `changes`) still opens it. The `changes` mod itself stays
  installed and unused.
- **On the side by default. A Maximize button** in its header opens the same mod as a dialog:
  `openOverlay({ mod: "review", kind: "dialog", width: 0.96, height: 0.94, props: { max: true } })`.
  Esc or the Restore button closes it. The dialog is a separate copy, so what to show passes through
  `shared("review.<repo>")`: the mode, base, open file, scroll, viewed marks and comments. Both copies
  read and write it, so closing the dialog leaves the side panel on the same file.
- **Highlighter: keep Prism.**
  - Shiki/TextMate would cost several MB of grammars and an Oniguruma WASM or ES2024 regex engine, and
    it is slower.
  - The built-in `EditorState` (tree-sitter) has no line tint and doesn't expose its tokens.
  - The gaps are fixed by feeding Prism better: tokenize **whole files** and add a **word-level
    diff**.
- **Code shared with pi-chat is copied.** Mods can't import outside their folder (verified:
  `herdr-app check` refuses `../`, and Linux symlinks don't resolve on the Windows side).
  - `mods/review/diff/` is the source (`highlight.js`, `words.js`, `prism.js`).
  - `scripts/herdr-app-sync-diff` copies them into `mods/pi-chat/diff/`.
  - A node test fails when the copies differ.
  - `scripts/herdr-app-build-prism` writes to `review/`, then runs the sync.
- **Everything below ships together** (split view, viewed marks, expand context included).

## Verified facts (2026-11-16)

- **No cross-mod imports.** See the code-sharing decision above.
- **The shipped panel's code** (`%USERPROFILE%/.config/herdr-app/mods/changes/main.js`, 212 lines) is
  the reference for:
  - finding the repo and its machine: the focused pane's cwd, and `on` for remote spaces;
  - reading git without writing under `.git`: `--no-optional-locks`, `core.fsmonitor=false`,
    `diff.autoRefreshIndex=false`, so the folder watch doesn't feed itself;
  - `watchFolder` for local repos and a 10 s timer for remote ones;
  - untracked files, repos without `HEAD`, and binary files;
  - the commit box (`add -A`, then `commit -m`).
- **Overlays:** `width`/`height` up to 1 are shares of the window. A `dialog` dims the window, and Esc
  closes it. (`herdr.d.ts` `OverlaySpec`.)
- **Agents** are terminals whose program reports a status. `agents()` lists them with their tab.
  `hc send <terminal> "text"` types into one without pressing Enter (Redline sends this way).
- **Work repos are on Gitea** (`ch03git.phonak.com`, v1.27.3). Personal repos are on GitHub. This
  matters for the PR follow-up only.
- `herdr-app-link`'s `mods/*/` glob picks up the new mod. `herdr-app-dev sync` copies only pi-chat:
  extend it.

## What it does

### Header
- Repo and branch, then a mode switch: **Changes** (worktree vs `HEAD`, as now) or **Branch**
  (`merge-base(<base>, HEAD)` vs the worktree: the whole piece of work).
  - Base: the upstream's default branch (`origin/HEAD`), else `main`/`master`. It can be picked from a
    short branch list.
- Totals (files, +/−, viewed n/m), Unified | Split, Maximize/Restore, Refresh.

### File list
- Path, status (A/M/D/R/U), +/−, and a viewed check.
- Renames detected (`-M`), unlike the shipped panel.
- The side panel stacks the list over the diff. Maximized, the list is a left column.

### Diff
- Virtualised rows with no line cap. Per-line cap: 4000 characters (lines are cut beyond that).
- Old and new line numbers. Unified, or **split** (old | new aligned, filler rows where one side has
  none). Split falls back to unified below 600 px wide.
- Syntax colours from Prism. Each side is tokenized from the whole file
  (`git show <base>:path`, and the worktree file). Past `MAX_TEXT` (400 000 characters) it falls back
  to per-hunk tokenizing as today.
- **Word highlight:** inside a hunk, pair each run of `-` lines with the `+` run after it, line by
  line. A word-level LCS on each pair (words, spaces and punctuation as tokens) marks changed tokens
  on a stronger tint. A pair less than 40 % alike is not marked: it was rewritten, not edited.
- Hunk headers show the enclosing function (git's `@@ … @@ name`). **Expand** above/below a hunk adds
  20 lines of context from the file. **Full file** shows the whole new file with the changes in place.
- Binary, too-large and unreadable files say so in place of a diff.

### Review state (per repo, in `shared`)
- **Viewed:** a file marked viewed stays marked until its diff changes (the key is a hash of its diff
  text). `n` jumps to the next unviewed file.
- **Comments to the agent:** select lines (click, shift-click for a range, on either side) and write a
  comment. Comments collect in a draft list under the file list.
  - **Send to agent** types one message into the active tab's agent with `hc send` and no Enter. The
    message is "Review comments:", then for each comment `path:line-range`, the diff lines and the
    comment.
  - The user reads it and sends it from the agent, or from pi-chat, which picks up Pi's draft when it
    shows. It refuses when the tab has no agent.
  - Sent comments are cleared. Unsent ones survive restarts (`shared`).

### Keys (when the mod has focus; `"focusable": true`)
- `j`/`k`: next/previous file.
- `n`/`p`: next/previous hunk.
- `v`: toggle viewed.
- `s`: toggle split.
- `m`: maximize or restore.
- `c`: comment on the selection.
- `r`: refresh.
- In a text box, Esc leaves it first.

### Commit
- Kept from the shipped panel (message box, `add -A` then `commit`), in Changes mode only.

## Not in scope (follow-up spec)
- PR list/review/comment for Gitea and GitHub. It would reuse this view with a `base...head` source.
  Redline's `hosting.js` is a reference for GitHub only.
- Staging hunks, discarding changes, inline editing.

## Risks
- `hc send` with newlines into Pi's editor: check whether a newline submits. If it does, send it as a
  bracketed paste or one line per comment.
- Prism speed on a whole 400 KB file in this JS runtime. Time it, and lower `MAX_TEXT` if a frame
  hitches.
- The dialog and the side panel are two copies writing the same `shared` key. Only user actions
  write, so the last one wins.

## Comments

2026-11-16, built (docs/herdr-review.md). Differences from the plan:
- **Scroll position is not shared** between the panel and the dialog. A script cannot read a virtual
  list's offset. The open file, mode, split, viewed marks and comments are shared.
- **The diff scrolls itself** (rows in view built by hand, not a virtual list): a GPUI virtual
  list keeps the wheel and never scrolls sideways. Both views scroll sideways (wheel, Shift+wheel,
  bar, `h`/`l`); the side panel shows one number column. (Changed after the first test.)
- **Commit runs in the person's interactive shell** so an SSH agent (and SSH commit signing) works.
  herdr-core's own environment has no `SSH_AUTH_SOCK`.
- **Comments to Pi** use the herdr-chat extension's `draft` inbox command, not `hc send`. They land
  in Pi's input unsent, so the newline risk is gone. Other agents get `hc send`, which submits.
- **Viewed marks** use the file's +/− counts as a key (known before its diff loads), plus its diff
  hash once loaded.
- **Prism loads faster:** `herdr-app-build-prism` patches `insertBefore` to change grammars in place
  instead of walking every grammar (DFS) after each insertion. The tokens are the same for all 117
  grammars, tested on 200 KB of this repo. The load used to take about 1 s in QuickJS, and
  `herdr-app check` interrupted it at random, for pi-chat too.
- `scripts/herdr-app-dev type TEXT` posts key presses to the dev window, so typing and keys can be
  tested. Posted messages hold no modifiers, so shift-click is not tested.
