#!/usr/bin/env bash
set -Eeuo pipefail

PKGS="gzip curl wget unzip tar npm"
sudo apt install $PKGS
