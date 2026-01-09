#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source $SCRIPT_DIR/../helpers.sh

echo ">> Installing zsh..."

if is_arch; then
    echo "Skipped on arch linux, done using yay"
    exit 0
fi

ZSH_PATH=$(which zsh)
if [[ ! -e "$ZSH_PATH" ]]; then
    echo "ZSH is not installed: $ZSH_PATH"
    exit 1
fi

if [[ ! "$SHELL" == */zsh ]]; then
    echo "Set zsh as default shell"
    # Change default shell
    chsh -s $ZSH_PATH
fi

OHZSH_PATH="$HOME/.oh-my-zsh"
if [[ ! -e "$OHZSH_PATH" ]]; then
    echo "Installing oh-my-zsh..."
    sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
else
    echo "oh-my-zsh already installed"
fi
