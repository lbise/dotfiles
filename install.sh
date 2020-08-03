#!/usr/bin/env bash
# Install dotfiles and setup system

PKGS="vim zsh ctags python gdb i3lock rofi feh xautolock"

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd)"

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

echo "Initializing git submodules:"
git submodule update --init --recursive
echo "-------------------------------------------------------------------------"

echo "OS: $OS"
case "$OS" in
	"Arch Linux")
		$DIR/arch.sh
		;;
	*)
		echo "Unsupported OS: $OS"
		exit 1
		;;
esac

echo "Creating symlinks:"
echo "-------------------------------------------------------------------------"
$DIR/symlinks.sh

echo "Installation completed"
echo "#########################################################################"
