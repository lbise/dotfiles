#!/bin/env bash
KEYS_DIR="/mnt/c/Users/13lbise/OneDrive - Sonova"
#MACHINE="ch03ww5027"

if [ -z "$1" ]; then
    echo "You must provide the machine name"
    exit
fi
MACHINE=$1

scp "${KEYS_DIR}/.gnupg/sonova_public.pgp" "${KEYS_DIR}/.gnupg/sonova_private.pgp" "${KEYS_DIR}/.ssh/id_ed25519_git_sonova.pub" "${KEYS_DIR}/.ssh/id_ed25519_git_sonova" 13lbise@${MACHINE}.corp.ads:/home/13lbise
