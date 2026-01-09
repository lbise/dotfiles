#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "********************************************************************************"
echo "Installation of Leo's dotfiles..."
echo "********************************************************************************"

source $SCRIPT_DIR/install/helpers.sh

# OS specific installation
if is_arch; then
    echo ">> Installing arch linux packages..."
	source $SCRIPT_DIR/install/packages_arch.sh
elif is_ubuntu; then
    echo ">> Installing ubuntu packages..."
	source $SCRIPT_DIR/install/packages_ubuntu.sh
fi

echo ">> Installing symlinks..."
$SCRIPT_DIR/install/symlinks.sh

echo ">> Installing external apps..."
source $SCRIPT_DIR/install/apps/all_apps.sh

echo "********************************************************************************"
echo "Installation completed"
echo "********************************************************************************"
