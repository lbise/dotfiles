#!/usr/bin/env bash
PLUGINS="$HOME/.vim/plugged"
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd)"
DST="$DIR/../vim_plugins"

#find $PLUGINS -maxdepth 1 -type d -exec sh -c "echo Copying '{}' && cd '{}' && pwd && mkdir $DIR/../vim/plugins/'{}' && git archive master | tar -x -C $DIR/../vim_plugins/'{}'" \;
echo "DIR=$DIR"
echo "DST=$DST"


cd $PLUGINS
find . -maxdepth 1 -type d \( ! -name . \) -exec sh -c "echo Copying '{}' && cd '{}' && mkdir $DST/'{}' && echo DST=$DST" \;



#find $PLUGINS -maxdepth 1 -type d \( ! -name plugged \) -exec sh -c "echo Copying '{}' && cd '{}' && pwd && mkdir $DST/'{}' " \;



#find $PLUGINS -maxdepth 1 -type d \( ! -name plugged \) -exec sh -c 'echo "Copying {}" && cd "{}" && echo "DST=$DST" && mkdir "${DST}/$(basename {})"' \;


#find $PLUGINS -maxdepth 1 -type d \( ! -name plugged \) | xargs -L1 -I{} sh -c 'echo "Copying {}" && cd "{}" && echo "DST=$DST" && mkdir "${DST}/$(basename {})"'
#find $PLUGINS -maxdepth 1 -type d \( ! -name plugged \) | xargs -L1 -I{} sh -c '' basename "{}"




#-exec sh -c 'echo "Copying {}" && cd "{}" && echo "DST=$DST" && mkdir "${DST}/$(basename {})"' \;
