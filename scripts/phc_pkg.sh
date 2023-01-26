#!/bin/env bash
if [ -z "$1" ]; then
    echo "Usage: $0 [-f] input"
    echo "\t-f: Force overwrite of output when creating archive locally"
    echo "\t-w: Output to windows repository"
	exit 1
fi

FORCE=0
if [ "$1" = "-f" ]; then
    echo "Use the force!"
    FORCE=1
    shift
fi

if [ "$1" = "-w" ]; then
    shift
    REPO="/mnt/ch03pool/murten_mirror/shannon/packages"
else
    REPO="/mnt/ch03pool/murten_mirror/shannon/linux/packages"
fi

echo "Target repository: $REPO"

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
    ARCHIVE="$INPUT"
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
