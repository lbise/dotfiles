#!/usr/bin/env bash
# Create symlinks from a file
# Entry format: target destination

set -e
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd)"

if [ -z "$1" ]; then
    echo "Missing arguments"
    echo "Usage: $0 <file>"
fi

CFG="$1"

if [ ! -f "$CFG" ]; then
    echo "\"$CFG\" doesn't exist"
    exit 1
fi

while IFS= read -r line; do
    # Remove \r otherwise line not properly detected as empty on windows
    line=${line//$'\r'/}
    if [ "${line:0:1}" != "#" ] && [ ! -z "${line// }" ]; then
        IFS=" " read -ra SYMLINK <<< "$line"
        TGT=`eval echo $( dirname "$DIR" )/${SYMLINK[0]}`
        DST=`eval echo ${SYMLINK[1]}`
        "$DIR/new_symlink.sh" "$TGT" "$DST"
    fi
done < "$CFG"
