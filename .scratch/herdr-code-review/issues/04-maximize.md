# Maximize as a dialog, state in shared

Status: done
Blocked by: 03

Spec: ../spec.md

- A Maximize button opens `openOverlay({ mod: "review", kind: "dialog", width: 0.96, height: 0.94, props: { max: true } })`. Restore and Esc close it.
- Maximized: the file list is a left column.
- `shared("review.<repo>")` holds the mode, base, open file and scroll, so both copies show the same thing.
