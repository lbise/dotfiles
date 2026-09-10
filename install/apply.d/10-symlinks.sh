#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
DOTFILES_DIR=$(cd -- "$SCRIPT_DIR/../.." && pwd)

"$DOTFILES_DIR/install/symlinks.sh"
