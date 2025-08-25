#!/usr/bin/env bash
# Complete Docker-friendly installation script using YAML config
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOTFILES_DIR="$(dirname "$SCRIPT_DIR")"

echo "Starting Docker-friendly dotfiles installation using YAML config..."

# Use the new YAML-driven system with minimal profile (perfect for Docker)
cd "$DOTFILES_DIR"
./install-yaml.sh --profile minimal --wslonly

echo "YAML-driven Docker installation completed!"