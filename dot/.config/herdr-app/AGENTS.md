# Herdr desktop app configuration

This directory is the dotfiles source for the **Herdr desktop app** configuration. The app runs natively on Windows; the tracked files here are linked into `%USERPROFILE%\.config\herdr-app` by `scripts/herdr-app-link`.

## This machine's setup

- There is intentionally no Windows shell workflow. WSL is configured as a Herdr machine, alongside the remote Linux machines. Do not mistake this for the app running inside WSL.
- The Windows GUI is `herdr-app`. It talks to `herdr-core` (`hc`), which runs terminals and agents on whichever machine is selected. Commands launched for a machine run on that machine (for WSL, in Linux/WSL).
- The older `herdr` terminal app/server in WSL is separate. Its `~/.config/herdr/config.toml` does not configure this GUI.
- The app's live/generated guide is `%USERPROFILE%\.config\herdr-app\AGENTS.md`. This tracked file documents the dotfiles source and setup; the live guide documents the app APIs and customization details.

## Where to make changes

- Edit tracked files under this directory, not the Windows profile copy. `scripts/herdr-app-link` links top-level JSON files, `themes/*.json`, `layouts/*.json`, and `mods/*/` into the Windows app config.
- Settings and keybindings are JSON. UI structure/custom behavior is implemented through layouts and mods; themes are JSON. Mods use the app's JavaScript/TypeScript API and are not Windows shell scripts.
- If a linked file or mod must be added, check `scripts/herdr-app-link`'s glob patterns and run the script from WSL to link it. Windows symlinks require Developer Mode or an elevated WSL session.
- A mod's external commands should use the Herdr app API (`exec`) and specify the target machine when needed. Keep machine-specific command assumptions explicit; prefer portable shell commands if the command may run on different Linux machines.
