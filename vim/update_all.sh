#!/usr/bin/env bash
# Download all VIM from their repos

set -e
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd)"
TOP="$DIR/.."

DST_DIR="$TOP/vim/pack/leo/start"
OUT_DIR="$TOP/download"

if [ -d $OUT_DIR ]; then
    rm -rf $OUT_DIR
fi

mkdir $OUT_DIR
cd $OUT_DIR

rm -rf $DST_DIR/*

BUFKILL=('vim-bufkill' 'qpkorr')
OBSESSION=('vim-obsession' 'tpope')
AIRLINE=('vim-airline' 'vim-airline')
FUGITIVE=('vim-fugitive' 'tpope')

VIM=(BUFKILL OBSESSION AIRLINE FUGITIVE)
declare -n PLUGIN

for PLUGIN in "${VIM[@]}"; do
    NAME=${PLUGIN[0]}
    AUTHOR=${PLUGIN[1]}
    echo "Download $NAME from $AUTHOR"
    wget -O ${NAME}.zip https://github.com/${AUTHOR}/${NAME}/archive/refs/heads/master.zip
    unzip $NAME.zip
    mv $NAME-master $NAME
    rm $NAME.zip
done

mv $OUT_DIR/* $DST_DIR
