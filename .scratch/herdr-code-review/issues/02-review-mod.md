# review mod replaces the Changes panel (parity)

Status: done
Blocked by: 01

Spec: ../spec.md

- `mods/review/` (`main.js`, `mod.json` with `"place": "none", "focusable": true`).
- Port the shipped `changes` behaviour: repo and machine lookup, read-only git flags, watch or poll, untracked files, no `HEAD`, binary files, commit box.
- In `layouts/leo.json`, the `changes` block becomes `"mod": "review"`, with its id kept.
- Extend `herdr-app-dev sync` to the new mod.
- `herdr-app check` passes, and the tab bar's Changes button opens it.
