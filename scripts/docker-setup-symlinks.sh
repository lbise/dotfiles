#!/usr/bin/env bash
# Docker-friendly script to setup only symbolic links
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOTFILES_DIR="$(dirname "$SCRIPT_DIR")"

# Source required modules
source "$DOTFILES_DIR/lib/common.sh"
source "$DOTFILES_DIR/lib/symlinks.sh"

# Export variables
export TEST_MODE=0
export LINK_ONLY=0
export WORK_INSTALL=${WORK_INSTALL:-0}

echo "Setting up dotfiles symbolic links for Docker environment..."
setup_symlinks
echo "Symbolic links setup completed."