#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_NAME="$(basename "$0")"

# Run all .sh scripts in this directory except this one
for script in "$SCRIPT_DIR"/*.sh; do
    [[ "$(basename "$script")" == "$SCRIPT_NAME" ]] && continue
    echo "Running $(basename "$script")..."
    "$script"
done
