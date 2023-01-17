#!/bin/env bash
REPO="/mnt/ch03pool/murten_mirror/shannon/linux/packages"

if [ -z "$1" ]; then
	echo "You must specify an input file"
	exit 1
fi

INPUT=$1

if [ ! -f "$INPUT" ]; then
	echo "$INPUT does not exist!"
	exit 1
fi

if [ ! -d "$REPO" ]; then
	echo "Cannot access repo at $REPO!"
	exit 1
fi

MD5=($(md5sum $INPUT))
OUTPUT="$REPO/$MD5"

#if [ -f "$OUTPUT" ]; then
#	echo "$OUTPUT already exist!"
#	exit 1
#fi

if [ "${INPUT: -3}" != ".7z" ]; then
	echo "File is not a 7z!"
	exit 1
fi

echo "Packaging $INPUT ($MD5)"

exit 1

cp $INPUT $OUTPUT

INPUT_PATH=$(realpath $INPUT)
echo "$INPUT_PATH"
INPUT_PATH=$(basename "${INPUT}")
echo "$INPUT_PATH"
#echo "Real path: $INPUT_PATH"

#echo "cp $INPUT $(basename $INPUT)/$MD5"
