#!/usr/bin/env bash
# Compatibility wrapper for the old command name.
set -Eeuo pipefail

SCRIPT_DIR=$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
exec "$SCRIPT_DIR/dotfiles" update "$@"
