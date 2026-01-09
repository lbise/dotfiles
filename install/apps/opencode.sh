#!/usr/bin/env bash
set -Eeuo pipefail

echo ">> Installing opencode..."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source $SCRIPT_DIR/../helpers.sh

# Check if opencode is already installed
if command -v opencode &> /dev/null; then
    echo "opencode is already installed ($(opencode --version 2>/dev/null || echo 'version unknown'))"
    exit 0
fi

curl -fsSL https://opencode.ai/install | bash
