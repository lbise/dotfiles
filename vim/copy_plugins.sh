#!/usr/bin/env bash
PLUGINS="$HOME/.vim/plugged"
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd)"
DST="$DIR/../vim_plugins"

if [ ! -d "$PLUGINS" ]; then
    echo "$PLUGINS does not exist!"
    exit
fi

rm -rf $DST/*
cd $PLUGINS
find . -maxdepth 1 -type d \( ! -name . \) -exec sh -c "echo Copying '{}' to $DST/'{}' && cd '{}' && mkdir $DST/'{}' && git checkout-index --prefix=$DST/'{}'/ -a" \;
