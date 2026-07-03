# OSC8 file links for pi

This extension emits clickable OSC8 links from pi and routes `pi-open://file` URLs to a Neovim instance running in the originating tmux session.

It also automatically linkifies existing file paths in assistant/tool output when the path resolves to an existing regular file on disk.

## Flow

```text
pi /osc8-link path:line
  -> OSC8 hyperlink with pi-open://file?... metadata
  -> OS protocol handler
  -> ~/.scripts/pi-open-handler
  -> tmux session PI_NVIM_SERVER
  -> nvim --server ... --remote-expr ...
```

On Windows Terminal + WSL:

```text
Windows click -> wscript bridge -> wsl.exe -> WSL ~/.scripts/pi-open-handler
```

## Files

- `dot/.pi/agent/extensions/osc8-links/index.ts` - pi extension
- `scripts/pi-open-handler` - Linux/WSL URL handler
- `scripts/nvim-tmux-session` - starts Neovim with a tmux-session-scoped RPC socket
- `scripts/register_pi_open_linux.sh` - registers `pi-open://` on native Linux
- `scripts/register_pi_open_windows.ps1` - registers `pi-open://` on Windows and bridges to WSL

## Start Neovim

Inside the tmux session where pi runs, start Neovim with:

```sh
~/.scripts/nvim-tmux-session
```

This sets tmux environment variables:

```text
PI_NVIM_SERVER=/run/user/.../nvim-...sock
PI_NVIM_PANE=%...
```

The click handler uses these to find the right Neovim instance.

## Register the URL handler

### WSL / Windows Terminal

Run from WSL:

```sh
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(wslpath -w ~/.scripts/register_pi_open_windows.ps1)"
```

This installs a hidden Windows `wscript.exe` bridge for `pi-open://` that calls back into the current WSL distro.

Test:

```sh
powershell.exe -NoProfile -Command "Start-Process 'pi-open://echo?wslDistro=${WSL_DISTRO_NAME}&message=hello'"
cat ~/.cache/pi-open-handler/urls.log
```

### Native Linux

```sh
~/.scripts/register_pi_open_linux.sh
```

Test:

```sh
xdg-open 'pi-open://echo?message=hello'
cat ~/.cache/pi-open-handler/urls.log
```

## Use in pi

Reload extensions:

```text
/reload
```

Emit a test handler link:

```text
/osc8-test
```

Emit a file link manually:

```text
/osc8-link dot/.zshrc:10
/osc8-link src/foo.ts:42:3
```

Assistant/tool output paths such as `dot/.zshrc:10` are also linkified automatically if the file exists.

Clicking a link should open/select the file in the tmux session's Neovim and jump to the requested line/column.

## Troubleshooting

Check logs:

```sh
cat ~/.cache/pi-open-handler/urls.log
```

Check tmux Neovim registration:

```sh
tmux show-environment -t "$(tmux display-message -p '#S')" PI_NVIM_SERVER
tmux show-environment -t "$(tmux display-message -p '#S')" PI_NVIM_PANE
```

If those are missing, restart Neovim with:

```sh
~/.scripts/nvim-tmux-session
```

Disable automatic linkification with `~/.pi/agent/osc8-links.json`:

```json
{ "autoLink": false }
```

If Windows clicks are slow and print `wsl: Processing /etc/fstab with mount -a failed`, fix WSL `/etc/fstab` or make slow mounts `noauto,nofail,x-systemd.automount`, then restart WSL with `wsl --shutdown` when convenient.
