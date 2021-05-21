#!/usr/bin/env bash
# Install script for ALL Linux distributions

set -e
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd)"
DOTFILES="$DIR/.."

echo "#########################################################################"
echo "Leo's dotfiles install script"
echo "#########################################################################"

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$NAME
else
    # Fall back to uname, e.g. "Linux <version>", also works for BSD, etc.
    OS=$(uname -s)
fi

echo "OS detected: $OS"
case "$OS" in
        "Ubuntu")
                INSTALLER="apt-get install "
                ;;
	"Arch Linux")
                INSTALLER="pacman -S --needed "
		;;
	*)
		echo "Unsupported OS: $OS"
		exit 1
		;;
esac

echo "-------------------------------------------------------------------------"
echo "Installing base packages"
PKGS="zsh"
PKGS="$PKGS ctags"
PKGS="$PKGS fzf"
PKGS="$PKGS rxvt-unicode"

sudo $INSTALLER $PKGS

########## Terminal
sudo update-alternatives --config rxvt-unicode

########## Shell
if [ -z "$ZSH" ]; then
	sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended
fi

# Change default shell to zsh
if [ "$SHELL" != "$(which zsh)" ]; then
	chsh -s $(which zsh)
fi

echo "-------------------------------------------------------------------------"
echo "Delete existing files"
sudo rm -rf ~/.vimrc
sudo rm -rf ~/.vim
sudo rm -rf ~/.gitconfig
sudo rm -rf ~/.zshrc

echo "-------------------------------------------------------------------------"
echo "Create symbolic links"
ln -sf $DOTFILES/.vimrc ~/.vimrc
ln -sf $DOTFILES/vim ~/.vim
ln -sf $DOTFILES/.gitconfig ~/.gitconfig
ln -sf $DOTFILES/.zshrc ~/.zshrc

echo "#########################################################################"
echo "Installation completed"
echo "#########################################################################"
