#!/usr/bin/env bash

set -e
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd)"
DOTFILES="$DIR/.."

$DIR/install-linux.sh

echo "-------------------------------------------------------------------------"
echo "Work specific configuration"
sudo rm -rf ~/.gitconfig
ln -sf $DOTFILES/.gitconfigwork ~/.gitconfig

if [[ ! -d ~/.ssh ]]; then
		mkdir ~/.ssh
		cp /mnt/c/Users/13lbise/OneDrive\ -\ Sonova/.ssh/* ~/.ssh
		chmod 600 ~/.ssh/id_rsa-gitlab
fi

echo "#########################################################################"
echo "Work installation completed"
echo "#########################################################################"
