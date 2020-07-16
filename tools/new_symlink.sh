#!/usr/bin/env bash
# Create a sym link
if [ -z $1 ] || [ -z $2 ]; then
	echo "Missing arguments"
	echo "Usage: $0 <src> <dst>"
fi

SRC=$1
DST=$2

if [ ! -f $SRC ] && [ ! -d $SRC ]; then
	echo "$SRC doesn't exist"
	exit 1
fi

if [ -L $DST ]; then
	echo "Sym link already exists"
	exit 1
fi

echo "Creating sym link $2 -> $1"

mkdir -p $(dirname "${DST}")
ln -s -f $SRC $DST
