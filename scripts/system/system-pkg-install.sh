#!/usr/bin/env bash
# Fuzzy-pick packages from the official repos and/or the AUR, then install them.
# Usage: system-pkg-install.sh [all|repo|aur]   (default: all)
# Tab multi-selects, Enter installs, Esc cancels.
set -Eeuo pipefail

scope=${1:-all}

# One "repo/name" per line, skipping packages that are already installed.
list_repo() {
    pacman -Sl | awk '$4 !~ /^\[installed/ { print $1 "/" $2 }'
}

list_aur() {
    awk 'NR == FNR { installed[$1]; next } !($1 in installed) { print "aur/" $1 }' \
        <(pacman -Qqm) <(yay -Slqa)
}

case $scope in
    all)  list() { list_repo; list_aur; } ;;
    repo) list() { list_repo; } ;;
    aur)  list() { list_aur; } ;;
    *)    echo "Usage: $0 [all|repo|aur]" >&2; exit 2 ;;
esac

# Match on the package name only (field 2), so "aur"/"extra" don't match everything.
selection=$(list | fzf \
    --multi \
    --delimiter=/ --nth=2 \
    --prompt="install ($scope) > " \
    --header='tab: multi-select  alt-p: toggle preview  alt-j/k: scroll preview' \
    --preview='yay -Si {}' \
    --preview-window='down:60%:wrap' \
    --bind='alt-p:toggle-preview,alt-j:preview-down,alt-k:preview-up' \
    --color='pointer:green,marker:green') || exit 0

[[ -n $selection ]] || exit 0

mapfile -t packages <<<"$selection"
yay -S --needed "${packages[@]}" || status=$?

read -rsp $'\nPress enter to close…' _
exit "${status:-0}"
