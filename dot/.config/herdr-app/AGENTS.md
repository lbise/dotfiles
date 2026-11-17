# Herdr desktop app configuration

This directory is the dotfiles source for the **Herdr desktop app** configuration. The app runs natively on Windows (work machine, with WSL) and on Arch Linux (home desktop). `scripts/herdr-app-link` links the tracked files here into the app's config: `%USERPROFILE%\.config\herdr-app` when run from WSL, `~/.config/herdr-app` on native Linux (where `install/symlinks.sh` runs it).

Mods must work on both. On Windows "this computer" (`machine`/`on` null) is Windows and Pi runs only on other machines (WSL is one); on Linux this computer runs Pi too. `appHome()` containing a backslash is how mods tell the two apart.

## Windows setup

- There is intentionally no Windows shell workflow. WSL is configured as a Herdr machine, alongside the remote Linux machines. Do not mistake this for the app running inside WSL.
- The Windows GUI is `herdr-app`. It talks to `herdr-core` (`hc`), which runs terminals and agents on whichever machine is selected. Commands launched for a machine run on that machine (for WSL, in Linux/WSL).
- The older `herdr` terminal app/server in WSL is separate. Its `~/.config/herdr/config.toml` does not configure this GUI.
- The app's live/generated guide is `%USERPROFILE%\.config\herdr-app\AGENTS.md`. This tracked file documents the dotfiles source and setup; the live guide documents the app APIs and customization details.

## Where to make changes

- Edit tracked files under this directory, not the Windows profile copy. `scripts/herdr-app-link` links top-level JSON files, `themes/*.json`, `layouts/*.json`, and `mods/*/` into the Windows app config.
- Settings and keybindings are JSON. UI structure/custom behavior is implemented through layouts and mods; themes are JSON. Mods use the app's JavaScript/TypeScript API and are not Windows shell scripts.
- After editing a linked file or mod from WSL, run `scripts/herdr-app-link`: the app gets no change notifications from the WSL side, and only reloads a file or mod whose link is replaced. Without it the change shows only after an app restart.
- On native Linux the links point straight at the repo. Re-running `scripts/herdr-app-link` there also replaces each link, which makes the app reload it.
- If a linked file or mod must be added, check `scripts/herdr-app-link`'s glob patterns and run the script (from WSL for the Windows app) to link it. Windows symlinks require Developer Mode or an elevated WSL session.
- A mod's external commands should use the Herdr app API (`exec`) and specify the target machine when needed. Keep machine-specific command assumptions explicit; prefer portable shell commands if the command may run on different Linux machines.
