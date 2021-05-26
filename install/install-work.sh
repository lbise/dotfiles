#!/usr/bin/env bash

set -e
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd)"
DOTFILES="$DIR/.."

$DIR/install-linux.sh

echo "-------------------------------------------------------------------------"
echo "Work specific configuration"
sudo rm -rf ~/.gitconfig
ln -sf $DOTFILES/.gitconfigwork ~/.gitconfig

echo "#########################################################################"
echo "Work installation completed"
echo "#########################################################################"
