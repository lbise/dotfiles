#!/bin/env bash
REPO="/mnt/ch03pool/murten_mirror/shannon/linux/packages"

if [ -z "$1" ]; then
    echo "Usage: $0 [-f] input"
	exit 1
fi

FORCE=0
if [ "$1" = "-f" ]; then
    echo "Use the force!"
    FORCE=1
    shift
fi

INPUT="$1"
if [ ! -f "$INPUT" ] && [ ! -d "$INPUT" ]; then
	echo "$INPUT does not exist!"
	exit 1
fi

if [ ! -d "$REPO" ]; then
	echo "Cannot access repo at $REPO!"
	exit 1
fi

DO7Z=1
if [[ $INPUT == *.7z ]]; then
    echo "Already an archive"
    DO7Z=0
fi

if [ $DO7Z = 1 ]; then
    ARCHIVE=$(basename -- "$INPUT")
    ARCHIVE="${ARCHIVE%.*}.7z"

    if [ $FORCE = 0 ] && [ -f "$ARCHIVE" ]; then
        echo "$ARCHIVE already exists!"
        exit 1
    fi

    echo "Creating archive: $ARCHIVE"
    7z a $ARCHIVE $INPUT
fi

MD5=($(md5sum $ARCHIVE))
OUTPUT="$REPO/$MD5"
echo "Copying -> $OUTPUT"

cp $ARCHIVE $OUTPUT
