#!/bin/env bash
KEYS_DIR="/mnt/c/Users/13lbise/OneDrive\ -\ Sonova"
MACHINE="ch03ww5027"

scp "${KEYS_DIR}/.gnupg/sonova_public.pgp" 13lbise@${MACHINE}.corp.ads:/home/13lbise
scp "${KEYS_DIR}/.gnupg/sonova_private.pgp" 13lbise@${MACHINE}.corp.ads:/home/13lbise
scp "${KEYS_DIR}/.ssh/id_ed25519_git_sonova.pub" 13lbise@${MACHINE}.corp.ads:/home/13lbise
scp "${KEYS_DIR}/.ssh/id_ed25519_git_sonova" 13lbise@${MACHINE}.corp.ads:/home/13lbise
