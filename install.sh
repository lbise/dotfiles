#!/usr/bin/env bash
# Install dotfiles and setup system

set -e
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd)"

function usage() {
    echo "Usage: $0 home|work [cpy]"
    echo "  home: Setup for home"
    echo "  work: Setup for work"
    echo "  cpy: Copy files instead of creating symlinks"
}

echo "#########################################################################"
echo "Leo's dotfiles install script"
echo "#########################################################################"

if [ $# -eq 0 ]; then
    echo "No arguments supplied"
    usage
    exit 1
fi

if [ "$1" = "home" ]; then
    echo "Setting up for home"
    SETUP="HOME"
elif [ "$1" = "work" ]; then
    echo "Setting up for work"
    SETUP="WORK"
else
    echo "Unknown type of setup: $1"
    usage
    exit 1
fi

LNK="sym"
if [ "$2" = "cpy" ]; then
    LNK="cpy"
fi

echo "-------------------------------------------------------------------------"

echo "Initializing git submodules:"
git submodule update --init --recursive
echo "-------------------------------------------------------------------------"

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$NAME
else
    # Fall back to uname, e.g. "Linux <version>", also works for BSD, etc.
    OS=$(uname -s)
fi

echo "OS: $OS"
case "$OS" in
	"Arch Linux")
		"$DIR/arch.sh" $SETUP
                OSTYPE=LINUX
		;;
        MINGW*)
                "$DIR/mingw.sh" $SETUP
                OSTYPE=WINDOWS
                ;;
	*)
		echo "Unsupported OS: $OS"
		exit 1
		;;
esac
echo "-------------------------------------------------------------------------"
AFTER=""
if [ $LNK = "sym" ]; then
    echo "Creating symlinks:"
    LNKSCRIPT="$DIR/tools/new_symlinks.sh"
else
    echo "Copying files:"
    LNKSCRIPT="$DIR/tools/cp_files.sh"
    AFTER="src"
fi
echo "-------------------------------------------------------------------------"
LNKFILES=( "$DIR/symlinks_common.cfg" )

if [ $OSTYPE == "LINUX" ]; then
    LNKFILES+=( "$DIR/symlinks_linux.cfg" )
    sudo "$DIR/tools/new_symlinks.sh" "$DIR/symlinks_linux_root.cfg"
elif [ $OSTYPE == "WINDOWS" ]; then
    LNKFILES+=( "$DIR/symlinks_win.cfg" )
else
    echo "Unrecognized OS type!"
    exit 1
fi

if [ $SETUP == "HOME" ]; then
    LNKFILES+=( "$DIR/symlinks_home.cfg" )
elif [ $SETUP == "WORK" ]; then
    LNKFILES+=( "$DIR/symlinks_work.cfg" )
else
    echo "Unrecognized setup type!"
    exit 1
fi

for ((i = 0; i < ${#LNKFILES[@]}; i++))
do
    echo "${LNKFILES[$i]}:"
    "$LNKSCRIPT" "${LNKFILES[$i]}" "$AFTER"
done

echo "-------------------------------------------------------------------------"

echo "Installation completed"
echo "#########################################################################"
