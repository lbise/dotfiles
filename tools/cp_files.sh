#!/usr/bin/env bash
# Copy files from a file
# Entry format: target destination

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd)"

if [ -z "$1" ] || [ -z "$2" ]; then
    echo "Missing arguments"
    echo "Usage: $0 <file> <src|dst>"
    echo "  src: If set the files are copied from source -> destination"
    echo "  dst: If set the files are copied from destination -> source"
    exit 1
fi

CFG="$1"
DIRECTION="$2"

if [ ! -f "$CFG" ]; then
    echo "\"$CFG\" doesn't exist"
    exit 1
fi

while IFS= read -r line; do
    # Remove \r otherwise line not properly detected as empty on windows
    line=${line//$'\r'/}
    if [ "${line:0:1}" != "#" ] && [ ! -z "${line// }" ]; then
        IFS=" " read -ra SYMLINK <<< "$line"
        SRC=`eval echo $( dirname "$DIR" )/${SYMLINK[0]}`
        DST=`eval echo ${SYMLINK[1]}`
	if [ "$DIRECTION" == "dst" ]; then
	    TMP="$SRC"
	    SRC="$DST"
	    DST="$TMP"
	elif [ "$DIRECTION" != "src" ]; then
	    echo "Unknown direction $DIRECTION"
	    exit 1
	fi

        if [ -d "$SRC" ]; then
            OPT="-rT"
            mkdir -p "$DST"
        elif [ -f "$SRC" ]; then
            mkdir -p "$(dirname "${DST}")"
        fi

	echo "Copying $SRC -> $DST"
	cp $OPT "$SRC" "$DST"
    fi
done < "$CFG"
