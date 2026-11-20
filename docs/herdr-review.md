# Review in the Herdr app

`dot/.config/herdr-app/mods/review/` replaces Herdr's Changes panel: the `changes` block of
`layouts/leo.json` runs it, so the tab bar's Changes button opens it. Spec and decisions:
`.scratch/herdr-code-review/spec.md`.

- **Changes** compares the worktree with `HEAD`. **Branch** compares it with where the branch left
  its base (`git merge-base <base> HEAD`), so it shows the whole piece of work. The base defaults to
  `origin/HEAD` and can be picked from the header. Untracked files count as added in both modes.
- The diff is unified or side by side (the split button, `s`; side by side needs 600 px). The side
  panel shows one line-number column, maximized shows old and new. The diff scrolls itself, because a
  GPUI virtual list keeps the wheel and cannot scroll sideways. Sideways: a sideways wheel,
  Shift+wheel, the bar under the text, or `h`/`l`; the numbers stay put. Syntax colours come from Prism, tokenizing the whole old and new file (`diff/`), and
  changed words are marked. Folds between hunks open 20 lines per click; **Full file** opens all
  of them.
- The maximize button (`m`) opens the same mod as a dialog. Both copies keep what they show in
  `shared("review:<machine>:<repo>")`: mode, base, open file, split, viewed marks, comments.
- Comments: click a line (shift-click for a range), write, then **Add comment**. **Put in Pi's
  input** writes them into the tab's Pi as a draft, through the herdr-chat extension's inbox (a
  `draft` command). You read and send it there. Another agent gets them through `hc send`, which
  presses Enter.
- Keys, while the panel has focus (it takes it when shown or maximized; its edge lights up):
  `j`/`k` file, `n`/`p` hunk, arrows/space/`ctrl-d`/`ctrl-u`/`g`/`G` scroll, `u` next unviewed
  file, `v` viewed, `s` split, `f` full file, `h`/`l` sideways, `b` Changes/Branch, `B` base (j/k,
  Enter), `c` comment on the hunk, `C` on the file, `S` submit, `a` ask, `i` commit message, `m`
  maximize, `q` close, `r` refresh, `y` copy the file's path, `o` open it in Neovim, `?` the key
  list, Esc to leave a box or clear the selection. Usage, Tickets and Setups work the same way
  (`?` lists their keys).
- The file header's copy button copies the repo-relative path; the Neovim button (`nvim.js`) opens
  the file (`:drop`) in a Neovim running in the focused space on the repo's machine (the focused
  tab's first), through its server socket, and focuses it. With none, it opens Neovim in a new tab.
- **Commit** (Changes mode) runs `git add -A && git commit` in your interactive shell (`$SHELL -ic`).
  herdr-core starts programs without your shell's setup, so the SSH agent (`SSH_AUTH_SOCK`, from
  oh-my-zsh's ssh-agent plugin) is missing there, and SSH-signed commits fail.
- `diff/highlight.js`, `diff/words.js` and `diff/prism.js` are the source for pi-chat's copies.
  After editing them, run `scripts/herdr-app-sync-diff`. `diff/sync.test.js` fails while the
  copies differ.
- Tests: `node --test` in the mod folder, and `herdr-app check` on the linked mod.
