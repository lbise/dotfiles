#!/usr/bin/env bash
# Docker-friendly script to install only essential packages
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOTFILES_DIR="$(dirname "$SCRIPT_DIR")"

# Source required modules
source "$DOTFILES_DIR/lib/common.sh"
source "$DOTFILES_DIR/lib/packages.sh"

# Set Docker-friendly defaults
export TEST_MODE=0
export LINK_ONLY=0
export WORK_INSTALL=0
export COPY_VIM=0
export WSL_ONLY=1  # Skip heavy installations

echo "Installing essential packages for Docker environment..."
detect_os
install_packages
echo "Package installation completed."