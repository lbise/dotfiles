#!/usr/bin/env bash
# Docker-friendly script to setup only symbolic links using YAML config
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOTFILES_DIR="$(dirname "$SCRIPT_DIR")"

# Source required modules
source "$DOTFILES_DIR/lib/common.sh"
source "$DOTFILES_DIR/lib/config.sh"
source "$DOTFILES_DIR/lib/symlinks-yaml.sh"

# Export variables for Docker environment
export TEST_MODE=0
export LINK_ONLY=0
export WORK_INSTALL=${WORK_INSTALL:-0}
export WSL_ONLY=1  # Docker environment uses WSL_ONLY mode

echo "Setting up dotfiles symbolic links for Docker environment using YAML config..."
setup_symlinks_yaml
echo "YAML-driven symbolic links setup completed."