## Herdr app

The Herdr GUI runs natively on Windows (using WSL as one of its machines) and on Arch Linux. Its config lives in `dot/.config/herdr-app/`; see `dot/.config/herdr-app/AGENTS.md` before looking for Herdr config in WSL.

To drive or screenshot the dev Herdr window, use only `scripts/herdr-app-dev`. Never write or run ad-hoc PowerShell (or other Windows scripts) in `%TEMP%` or elsewhere: corporate endpoint security flags scripts that post keys/mouse to windows as keyloggers. If `herdr-app-dev` cannot do what you need (e.g. key chords with Shift/Ctrl), say so and stop; do not work around it.

## Agent skills

### Issue tracker

Issues are tracked as local Markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the five default canonical label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Domain documentation uses a single-context layout. See `docs/agents/domain.md`.
