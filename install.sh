#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "********************************************************************************"
echo "Installation of Leo's dotfiles..."
echo "********************************************************************************"

# OS specific
if [[ -f /etc/os-release ]]; then
    . /etc/os-release
    if [[ "$ID" == "arch" ]]; then
        echo ">> Installing arch linux packages"
	source $SCRIPT_DIR/install/packages_arch.sh
    fi
fi

# Install symlinks using stow
echo ">> Installing symlinks"
./install/stow.sh



echo "********************************************************************************"
echo "Installation completed"
echo "********************************************************************************"

