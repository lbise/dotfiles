#!/usr/bin/env bash
set -Eeuo pipefail

create_symlink() {
    SRC="$1"
    DST="$2"

    if [[ ! -e "$SRC" ]]; then
        echo "ERROR: $SRC does not exist"
        exit 1
    fi

    if [[ -e "$DST" ]]; then
        echo "$DST already exist, removing it"
        rm -rf "$DST"
    fi

    ln -sf "$SRC" "$DST"
    echo "Created symlink $SRC -> $DST"
}

is_arch() {
    [[ -f /etc/os-release ]] && grep -qi '^ID=arch' /etc/os-release
}

is_ubuntu() {
    [[ -f /etc/os-release ]] && grep -qi '^ID=ubuntu' /etc/os-release
}
