#!/usr/bin/env bash
set -e

PLUGINS_DIR="$HOME/.local/share"
PLUGINS="$PLUGINS_DIR/nvim"
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd)"
DST="."
COPY="/mnt/z/shannon/packages/bootstrap"

if [ ! -d "$PLUGINS" ]; then
    echo "$PLUGINS does not exist!"
    exit
fi

cd $PLUGINS_DIR
echo "Creating archive $DST/nvim_plugins_$MD5.tar.gz..."
tar -czf $DST/nvim_plugins_tmp.tar.gz nvim
MD5=$(md5sum $DST/nvim_plugins_tmp.tar.gz | cut -d " " -f1)
# Write MD5 to file read by install.sh
echo $MD5 > $DST/plugins.md5
echo "Copying archive $DST/nvim_plugins_$MD5.tar.gz to $COPY"
mv $DST/nvim_plugins_tmp.tar.gz $DST/nvim_plugins_$MD5.tar.gz
cp $DST/nvim_plugins_$MD5.tar.gz $COPY
echo ">> Remember to delete the previous version in $DST!"
