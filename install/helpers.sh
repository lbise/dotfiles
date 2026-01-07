#!/usr/bin/env bash
set -Eeuo pipefail

create_symlink() {
    SRC="$1"
    DST="$2"

    if [[ ! -e "$SRC" ]]; then
        echo "ERROR: $SRC does not exist"
        exit 1
    fi

    if [[ -e "$DST" || -L "$DST" ]]; then
        echo "$DST already exist, removing it"
        rm -rf "$DST"
    fi

    DST_DIR="$(dirname "$DST")"
    # Remove broken symlink if it exists, so we can create the directory
    if [[ -L "$DST_DIR" && ! -e "$DST_DIR" ]]; then
        echo "$DST_DIR is a broken symlink, removing it"
        rm -f "$DST_DIR"
    fi
    if [[ ! -e "$DST_DIR" ]]; then
        echo "Create directory $DST_DIR"
        mkdir -p "$DST_DIR"
    fi

    echo "Create symlink $SRC -> $DST"
    ln -sf "$SRC" "$DST"
}

is_arch() {
    [[ -f /etc/os-release ]] && grep -qi '^ID=arch' /etc/os-release
}

is_ubuntu() {
    [[ -f /etc/os-release ]] && grep -qi '^ID=ubuntu' /etc/os-release
}
