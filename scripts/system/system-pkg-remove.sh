#!/usr/bin/env bash
# Fuzzy-pick explicitly installed packages (repos + AUR) and remove them with their
# unused dependencies and config backups (pacman -Rns).
# Tab multi-selects, Enter removes, Esc cancels.
set -Eeuo pipefail

selection=$(pacman -Qqe | fzf \
    --multi \
    --prompt='remove > ' \
    --header='tab: multi-select  alt-p: toggle preview  alt-j/k: scroll preview' \
    --preview='pacman -Qi {}' \
    --preview-window='down:60%:wrap' \
    --bind='alt-p:toggle-preview,alt-j:preview-down,alt-k:preview-up' \
    --color='pointer:red,marker:red') || exit 0

[[ -n $selection ]] || exit 0

mapfile -t packages <<<"$selection"
sudo pacman -Rns "${packages[@]}" || status=$?

read -rsp $'\nPress enter to close…' _
exit "${status:-0}"
