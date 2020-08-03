#!/bin/zsh
# map this script on your i3 config.

# change as needed
DEFAULT_IMGS="$HOME/gitrepo/wallpapers"
TMP="/tmp/lockscreen.png"

if [[ -z $1 ]] ; then
    img_dir=$DEFAULT_IMGS
else
    img_dir=$1
fi;

randfile=$(ls $img_dir | sort -R | head -n1)
if [ -e $img_dir/$randfile ]; then
# Resize image to screen resolution
convert -scale `xdpyinfo | grep dimensions | awk '{ print $2 }'` $img_dir/$randfile /tmp/lockscreen.png
fi
i3lock -e -c 000000 -u -i $TMP
