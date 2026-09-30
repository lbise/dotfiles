# Leo desktop

<!-- impeccable:product-schema 1 -->

## Platform

Linux desktop. Hyprland, Quickshell, Hyprlock and SDDM on Arch Linux.

## Users and purpose

Leo uses this repository to configure his desktop. The desktop controls,
login screen and lock screen should look consistent and use readable text.

## Capabilities and constraints

- Keep Quickshell as the desktop bar, SDDM for login and Hyprlock for locking.
- Preserve password authentication and the existing optional fingerprint support.
- Preview authentication screens without logging out or locking the live desktop.
- SDDM runs before the user session and cannot depend on private home files.
- System-wide installation needs administrator approval. Never restart SDDM
  during an active session to apply visual changes.

## Confirmed assets and commitments

Use the existing wallpaper and the graphite/jade desktop design in `DESIGN.md`.
The shared theme is `dot/.config/leo/theme/palette.json`. Leo approved a darkened
wallpaper behind both authentication screens and a centred form with a clock
and date above it. He requested larger text after finding the original widget
text too small.
