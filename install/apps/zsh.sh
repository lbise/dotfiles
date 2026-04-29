#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../helpers.sh"

echo ">> Installing zsh..."

if is_arch; then
    echo "Skipped on arch linux, done using yay"
    exit 0
fi

ZSH_PATH="$(command -v zsh || true)"
if [[ -z "$ZSH_PATH" ]]; then
    echo "zsh is not installed, installing..."

    if command -v apt-get >/dev/null 2>&1; then
        sudo apt-get install -y zsh
    elif command -v brew >/dev/null 2>&1; then
        brew install zsh
    else
        echo "ERROR: zsh is not installed and no supported package manager was found" >&2
        exit 1
    fi

    ZSH_PATH="$(command -v zsh || true)"
    if [[ -z "$ZSH_PATH" ]]; then
        echo "ERROR: zsh installation completed but zsh was still not found in PATH" >&2
        exit 1
    fi
fi

if [[ "${SHELL:-}" != */zsh ]]; then
    # Only change shell if not at work, or if at work but running WSL
    if ! is_work || is_wsl; then
        echo "Set zsh as default shell"
        chsh -s "$ZSH_PATH"
    else
        echo "Skipping chsh at work (not WSL)"
    fi
fi

OHZSH_PATH="$HOME/.oh-my-zsh"
if [[ ! -e "$OHZSH_PATH" ]]; then
    echo "Installing oh-my-zsh..."
    RUNZSH=no CHSH=no KEEP_ZSHRC=yes ZSH="$OHZSH_PATH" \
        sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
else
    echo "oh-my-zsh already installed, upgrading..."
    "$OHZSH_PATH/tools/upgrade.sh"
fi
