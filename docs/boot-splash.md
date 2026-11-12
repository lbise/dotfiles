# Boot splash

The VOIDSTATION Plymouth theme shows from early boot until SDDM starts. An
amber ringed planet turns slowly, a station wheel spins beside it, and a
small ship orbits the planet and fires its engine once per orbit. When an
encrypted disk needs its passphrase, a jade lock and box appear under the
scene; each key press adds a square. Machines without encryption only see
the animation.

## Files

- `dot/.config/leo/boot/voidstation.py` draws the scene and writes the theme.
  It uses only the Python standard library. Colours come from
  `palette.json` plus TokyoNight Night (the terminal theme) for the planet,
  rings, station and stars. Jade is kept for the title, the ship's wings and the
  passphrase box.
- `scripts/system/system-boot-install.sh` installs it.
- `scripts/system/system-boot-preview.sh` shows it without rebooting.
- Design history and the prototype: `.scratch/voidstation-boot/`.

The scene is 320×180 pixels. The generator scales it by a whole number for
each connected screen (×6 for 1920×1080, ×8 for 2560×1440) because Plymouth
blurs images it scales itself. Moving parts are frame sequences: 160 planet
frames, 120 station frames and 480 ship frames (one per tick, flame and
exhaust included). The Plymouth script places them from position tables,
loading each frame when it is needed. About 3 MB per scale ends up in the
initramfs.

## Install

Run as your user, not with sudo:

```sh
bash scripts/system/system-boot-install.sh --dry-run
bash scripts/system/system-boot-install.sh
```

The dry run prints every change as a diff. The installer:

- installs `plymouth`
- generates the theme for this machine's screens into
  `/usr/share/plymouth/themes/voidstation`
- writes `/etc/plymouth/plymouthd.conf` (`Theme=voidstation`, `DeviceScale=1`)
- adds the `plymouth` hook after `systemd` or `udev` in `/etc/mkinitcpio.conf`,
  which places it before `sd-encrypt`
- on NVIDIA machines, adds `nvidia nvidia_modeset nvidia_uvm nvidia_drm` to
  `MODULES` and removes the `kms` hook, so the splash appears without a black
  gap and nouveau stays out of the initramfs
- adds `quiet splash` (and `nvidia_drm.modeset=1` on NVIDIA) to the kernel
  options:
  - systemd-boot: each entry first gets a copy titled "(no splash)",
    unchanged, as a fallback
  - GRUB: `GRUB_CMDLINE_LINUX_DEFAULT`, then `grub-mkconfig`; GRUB's advanced
    entries do not use that variable, so they stay text-only
- runs `mkinitcpio -P`

Changed files are backed up to `/var/lib/leo-boot-install/backups/<timestamp>/`.
Re-run the installer after changing `voidstation.py` or plugging in a screen
with a different resolution.

## Preview

From a text console (Ctrl+Alt+F3), not from Hyprland:

```sh
bash scripts/system/system-boot-preview.sh
```

It plays the animation for 12 seconds, then shows the passphrase box. Type
anything and press Enter to close it.

plymouthd only picks a graphical theme when the kernel command line contains
`splash`; without it, it falls back to text mode and nothing seems to happen.
The preview passes a fake command line, so it works before the first reboot.
It runs on the current console instead of tty1, where SDDM and the Hyprland
session live. plymouthd does not log to the journal; the preview writes its
debug output to `/tmp/plymouth-preview.log`.

## Undo

Boot the "(no splash)" entry (systemd-boot) or a GRUB advanced entry if the
splash misbehaves. To remove it, copy the files from the backup directory back
over `/etc/mkinitcpio.conf`, the boot entries or `/etc/default/grub`, then run
`sudo mkinitcpio -P` (and `sudo grub-mkconfig -o /boot/grub/grub.cfg` on
GRUB).

## Boot menu (rEFInd)

rEFInd shows the same scene before Linux starts. The planet sits on the
left and the station on the right, with the OS icons between them: Arch, plus
Windows on machines that have it. Below them are shutdown, reboot and
firmware-setup icons, and the selected entry's name in an 8×8 console font
(`drdos8x8` from kbd). The highlight is a set of jade corner brackets.

```sh
bash scripts/system/system-bootmenu-install.sh --dry-run
bash scripts/system/system-bootmenu-install.sh
```

Run it after `system-boot-install.sh`. It:

- installs `refind` and copies `refind_x64.efi` to `/boot/EFI/refind`, plus a
  pacman hook (`/etc/pacman.d/hooks/refind.hook`) that copies it again after
  upgrades
- generates the theme for the largest connected screen into
  `/boot/EFI/refind/themes/voidstation` (`voidstation.py refind`)
- writes `/boot/EFI/refind/refind.conf` with manual entries only. Arch Linux
  takes its kernel options from `/proc/cmdline`, without the boot loader's own
  arguments, and adds `quiet splash`. Its submenu (F2 or Insert) offers
  "Boot without splash", the fallback initramfs if one exists, and the
  previous boot menu (systemd-boot or GRUB). Those stay installed. Windows is
  added when the firmware has a Windows Boot Manager entry; it boots from its
  own ESP by partition GUID.
- creates a firmware boot entry called VOIDSTATION. On the desktop, Windows
  Boot Manager stays first so Windows still boots by default; VOIDSTATION goes
  second and is picked with F12. Elsewhere VOIDSTATION goes first.

The firmware boot order before the change is saved as
`efibootmgr-before.txt` in the backup directory. Re-run the installer after
changing kernel options, the art, or the screen.

Icon sizes follow rEFInd's layout (`refind/menu.c`): the highlight tile is
9/8 of the big icon and 4/3 of the small one. Icons of 24 and 12 scene pixels
give tiles of 27 and 16, so every scale stays on whole pixels. rEFInd inverts
font colours on a dark background, so `font.png` stores inverted jade.

### Undo the boot menu

Pick the previous boot menu from the Arch submenu, or use the firmware boot
key (F12) to choose another entry. On the laptop the firmware's own disk entry
boots `\EFI\BOOT\BOOTX64.EFI`, which is systemd-boot. To remove rEFInd
completely:

```sh
sudo efibootmgr                      # find the VOIDSTATION Boot#### number
sudo efibootmgr -b XXXX -B           # delete it
sudo rm -r /boot/EFI/refind /etc/pacman.d/hooks/refind.hook
```
