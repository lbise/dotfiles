# Agent Operating Guide (≈20 lines)

1. **No formal build** – this repo is a personal dot-files collection (bash/zsh, vim/nvim lua, python utilities).  Nothing needs compiling.
2. **Tests** – there is no test suite yet; feel free to add one (pytest is preferred:  `pytest path/to/test_file.py::test_name`).
3. **Linting:**
   • Bash/SH ‑ `shellcheck scripts/foo.sh`  – autofix with `shfmt -w`.
   • Python  ‑ `ruff check scripts/`  – auto-format with `ruff format scripts/`.
   • Lua     ‑ `stylua nvim/`.
4. **Commit Hook:**  `.githooks/commit-msg` enforces a Conventional-Commit prefix; keep messages short & imperative.
5. **Imports (Python):** standard → third-party → local; each block separated by a blank line (ruff verifies).
6. **Formatting:** 80-120 cols; use single quotes (see `ruff.format.quote-style = 'single'`).  Run `black` only if ruff is insufficient.
7. **Naming:** snake_case for files & python identifiers; CamelCase for classes; SCREAMING_SNAKE for constants; bash vars also SCREAMING_SNAKE.
8. **Types:** annotate new Python code with typing; prefer `from __future__ import annotations` for forward refs.
9. **Error handling:**
   • Bash – `set -euo pipefail` at top; use functions + `trap` for cleanup.
   • Python – raise specific exceptions, log with `logging` not `print`.
10. **Lua Neovim:** follow `core/*` structure; global namespace avoided—return tables.
11. **Secrets:** do **not** add keys inside `gpg/` or `ssh_machines.txt` – use environment variables.
12. **Executability:** keep scripts executable (`chmod +x`) and include a `#!/usr/bin/env bash|python3` shebang.
13. **Directory conventions:**
    `scripts/` – small CLIs, `nvim/` – editor config, `ghostty/` – terminal config, `archives/` – large blobs (never modify).
14. **Cursor/Copilot rules:** none found; standard OpenAI/Copilot defaults apply.
15. **PR checklist:** run linters, ensure hook passes, test new scripts with `shellcheck -x`.
16. Agents may create additional tooling (Makefile, CI) but MUST update this guide afterwards.
