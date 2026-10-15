# New Arch machine

Turns a bare Arch install (login shell only) into the full Hyprland desktop.

## Scripts

| Script | Runs | Job |
| --- | --- | --- |
| `bootstrap.sh` | Once, via `curl` | Installs git, base-devel and yay, clones the repo, runs `dotfiles bootstrap` |
| `install.sh` (`dotfiles bootstrap`) | Once | Packages, symlinks, user apps, then `setup_arch.sh` |
| `install/packages_arch.sh` | Often | Apps and tools. Add packages here, then run `dotfiles system` on each machine |
| `install/setup_arch.sh` (`dotfiles setup`) | Once per machine | System stack and one-time configuration |

`setup_arch.sh` installs the stack the dotfiles assume: Hyprland with uwsm,
SDDM, the Hyprland portal, PipeWire, NetworkManager with iwd as its Wi-Fi
backend, BlueZ and UPower. It also enables Color, ParallelDownloads and
multilib in pacman, enables the system services, enables the elephant user
service, installs the fonts, and installs the SDDM theme. On a machine with a
battery it adds power-profiles-daemon.

It enables services without starting them, so reboot once it finishes. It is
idempotent: to apply a new one-time step on an existing machine, add it to the
script and run `dotfiles setup`.

## Before you start

The machine needs network access to download anything. Include `iwd` or
`networkmanager` when installing Arch, otherwise Wi-Fi will not work after the
first boot. Your user also needs sudo rights.

## Install

Log in as your user (not root) and run:

```bash
curl -fsSL https://raw.githubusercontent.com/lbise/dotfiles/master/bootstrap.sh | bash
```

Then reboot. SDDM starts and offers the Hyprland (uwsm-managed) session.

If the base install enabled `systemd-networkd`, the script prints a warning.
Disable it after confirming NetworkManager works:

```bash
sudo systemctl disable --now systemd-networkd.service
```

## Manual steps

These need you:

- Copy your SSH and GPG keys, then switch the repo remote to SSH:
  `git -C ~/gitrepo/dotfiles remote set-url origin git@github.com:lbise/dotfiles.git`
- Sign in to Dropbox, the browser and other accounts.
- Add a `monitor =` line to `dot/.config/hypr/hyprland.conf` if the
  `preferred,auto` fallback is wrong for the screen.
- Install hardware drivers the base install missed (GPU, microcode).
