#!/bin/env bash
if [ "$#" -ne 3 ]; then
	echo "Missing args: $0 old-word new-word root"
	exit
fi

OLD_WORD=$1
NEW_WORD=$2
ROOT=$3

echo "$OLD_WORD -> $NEW_WORD"
#git grep -l "TODO" . | xargs -i@ sed -i 's/TODO/TODO(anon)/g' @
git grep -l "${OLD_WORD}" $ROOT | xargs -i@ sed -i "s/${OLD_WORD}/${NEW_WORD}/g" @
