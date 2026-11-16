# Shared diff core: whole-file highlight, word diff, sync to pi-chat

Status: done

Spec: ../spec.md

- Move `pi-chat/diff/highlight.js` and `prism.js` to `mods/review/diff/` as the source.
- Add whole-file highlighting: tokenize the old and new text once, map diff rows to file lines. Keep per-hunk tokenizing as the fallback past `MAX_TEXT`.
- Add `words.js`: a word-level LCS for paired `-`/`+` lines. It returns the changed ranges per line, and skips pairs less than 40 % alike.
- `scripts/herdr-app-sync-diff` copies them into `pi-chat/diff/`. Point `herdr-app-build-prism` at review and make it run the sync. Add a node test that fails when the copies differ.
- Use word marks in pi-chat's `diff/view.js` too.
- Tests: tokens of a hunk that starts inside a block comment; word ranges; the similarity cutoff.
