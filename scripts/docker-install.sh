#!/usr/bin/env bash
# Complete Docker-friendly installation script
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOTFILES_DIR="$(dirname "$SCRIPT_DIR")"

echo "Starting Docker-friendly dotfiles installation..."

# First install packages
"$SCRIPT_DIR/docker-install-packages.sh"

# Then setup symlinks
"$SCRIPT_DIR/docker-setup-symlinks.sh"

echo "Docker installation completed!"