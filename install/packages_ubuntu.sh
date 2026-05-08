#!/usr/bin/env bash
set -Eeuo pipefail

PKGS="gzip curl wget unzip tar build-essential"
sudo apt install $PKGS
