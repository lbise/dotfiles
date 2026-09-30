#!/usr/bin/env bash
# Update the system from a terminal.
# Usage: system-update.sh [packages|firmware]   (default: packages)
#   packages  full upgrade of repo + AUR packages, then orphan and reboot checks
#   firmware  fwupd refresh and update
set -Eeuo pipefail

update_packages() {
    # Inhibit idle and sleep so the machine doesn't suspend halfway through an upgrade.
    systemd-inhibit --what=idle:sleep --who="system-update" --why="Updating packages" \
        yay -Syu

    local orphans
    orphans=$(pacman -Qdtq || true)
    if [[ -n $orphans ]]; then
        echo
        echo "Orphaned packages (no longer required by anything):"
        sed 's/^/  /' <<<"$orphans"
        read -rp "Remove them? [y/N] " answer
        if [[ $answer == [yY] ]]; then
            mapfile -t orphan_list <<<"$orphans"
            sudo pacman -Rns "${orphan_list[@]}"
        fi
    fi

    # An upgraded kernel removes the running kernel's module directory.
    if [[ ! -d /usr/lib/modules/$(uname -r) ]]; then
        echo
        echo "The running kernel was replaced by this update. Reboot to use the new one."
    fi
}

update_firmware() {
    fwupdmgr refresh --force || true
    fwupdmgr get-updates || { echo "No firmware updates."; return 0; }
    fwupdmgr update
}

case ${1:-packages} in
    packages) update_packages ;;
    firmware) update_firmware ;;
    *) echo "Usage: $0 [packages|firmware]" >&2; exit 2 ;;
esac

read -rsp $'\nPress enter to close…' _
