#!/usr/bin/env bash
set -Eeuo pipefail

PKGS="gzip curl wget unzip tar"
sudo apt install $PKGS
