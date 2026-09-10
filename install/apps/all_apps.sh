#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_NAME="$(basename "${BASH_SOURCE[0]}")"

# Run every installer. update_apps.sh is an alternate entry point for the
# safe, version-aware subset and must not run again during a full install.
for script in "$SCRIPT_DIR"/*.sh; do
    case "$(basename "$script")" in
        "$SCRIPT_NAME"|update_apps.sh) continue ;;
    esac
    echo "Running $(basename "$script")..."
    "$script"
done
