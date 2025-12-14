#!/usr/bin/env bash

TZ="$1"
if [[ -z $1 ]]; then
    # Use default
    TZ="Europe/Zurich"
fi

sudo timedatectl set-timezone "$TZ"
