#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

$SCRIPT_DIR/zsh.sh
$SCRIPT_DIR/opencode.sh
$SCRIPT_DIR/tmux.sh
$SCRIPT_DIR/ripgrep.sh
$SCRIPT_DIR/fzf.sh
