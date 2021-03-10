#!/usr/bin/env bash
# Create a sym link
if [ -z "$1" ] || [ -z "$2" ]; then
	echo "Missing arguments"
	echo "Usage: $0 <src> <dst>"
	exit 1
fi

SRC="$1"
DST="$2"

if [ ! -f "$SRC" ] && [ ! -d "$SRC" ]; then
	echo "\"$SRC\" doesn't exist"
	exit 1
fi

if [ -L "$DST" ]; then
	echo "Sym link already exists"
	exit 0
fi

echo "Creating sym link \"$2\" -> \"$1\""

mkdir -p "$(dirname "${DST}")"

OS=$(uname -s)
if [[ "$OS" == "MINGW"* ]]; then
    if [[ ! $(sfc 2>&1 | tr -d '\0') =~ SCANNOW ]]; then
        echo "You must run the console with admin rights"
        exit 1
    fi

    export MSYS=winsymlinks:nativestrict
fi

ln -s -f "$SRC" "$DST"
