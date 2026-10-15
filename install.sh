#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "********************************************************************************"
echo "Installation of Leo's dotfiles..."
echo "********************************************************************************"

source "$SCRIPT_DIR/install/helpers.sh"

# Run each step as its own process, never source it: a sourced step that sets
# SCRIPT_DIR breaks every step after it.
if is_arch; then
    echo ">> Installing arch linux packages..."
    "$SCRIPT_DIR/install/packages_arch.sh"
elif is_ubuntu; then
    echo ">> Installing ubuntu packages..."
    "$SCRIPT_DIR/install/packages_ubuntu.sh"
fi

echo ">> Installing symlinks..."
"$SCRIPT_DIR/install/symlinks.sh"

echo ">> Installing external apps..."
"$SCRIPT_DIR/install/apps/all_apps.sh"

if is_arch && ! is_work; then
    echo ">> Running one-time Arch setup..."
    "$SCRIPT_DIR/install/setup_arch.sh"
fi

echo "********************************************************************************"
echo "Installation completed"
echo "********************************************************************************"
