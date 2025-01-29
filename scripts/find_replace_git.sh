#!/bin/env bash
if [ "$#" -lt 3 ]; then
	echo "Missing args: $0 old-word new-word root [extension]"
	exit
fi

OLD_WORD=$1
NEW_WORD=$2
ROOT=$3

EXT=""
if [ "$#" -gt 3 ]; then
    EXT="$4"
fi

echo "$OLD_WORD -> $NEW_WORD"
if [[ $EXT != "" ]]; then
    EXT="*.$EXT"
    echo "Extension: $EXT"
fi

git grep -l "${OLD_WORD}" "$ROOT"/"$EXT" | xargs -i@ sed -i "s/\<${OLD_WORD}\>/${NEW_WORD}/g" @
