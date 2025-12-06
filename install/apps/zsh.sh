#!/usr/bin/env bash
set -Eeuo pipefail

ZSH_PATH="/usr/bin/zsh"
if [[ ! -e "$ZSH_PATH" ]]; then
    echo "ZSH is not installed: $ZSH_PATH"
    exit 1
fi

# Change default shell
chsh -s $ZSH_PATH

sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"


