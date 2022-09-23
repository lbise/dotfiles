#!/bin/env bash
USER="13lbise"
OPTS="-X"

if [ -z "$1" ]; then
    echo "You must provide the machine index!"
    exit
fi

if [ "$1" = 0 ]; then
    MACHINE="ch03ww5027"
elif [ "$1" = 1 ]; then
    MACHINE="ch03ww6xd2cf3"
else
    echo "Invalid index!"
    exit
fi

MACHINE="${MACHINE}.corp.ads"

echo "Connecting to $MACHINE"
ssh $USER@$MACHINE $OPTS $2
