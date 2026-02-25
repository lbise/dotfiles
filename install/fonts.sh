#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Installing fonts..."

# Configuration
FONTS=("FiraCode" "Iosevka" "JetBrainsMono")
FONT_DIR="$HOME/.local/share/fonts/NerdFonts"
CUSTOM_FONT_DIR="$SCRIPT_DIR/../fonts"
TMP_DIR=$(mktemp -d)

# Ensure font directory exists
mkdir -p "$FONT_DIR"

# Get the latest release version
echo "Fetching latest Nerd Fonts release..."
NERD_FONTS_VERSION=$(curl -s https://api.github.com/repos/ryanoasis/nerd-fonts/releases/latest | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')

if [[ -z "$NERD_FONTS_VERSION" ]]; then
    echo "✗ Failed to fetch latest release version"
    exit 1
fi

echo "Latest version: $NERD_FONTS_VERSION"

# Install each font
for FONT_NAME in "${FONTS[@]}"; do
    echo ""
    echo "Processing ${FONT_NAME} Nerd Font..."

    # Check if font is already installed
    if fc-list : family | grep -qi "^${FONT_NAME} Nerd Font"; then
        echo "  ✓ ${FONT_NAME} Nerd Font is already installed, skipping..."
        continue
    fi

    DOWNLOAD_URL="https://github.com/ryanoasis/nerd-fonts/releases/download/${NERD_FONTS_VERSION}/${FONT_NAME}.zip"

    echo "  Downloading..."
    if ! curl -L -o "$TMP_DIR/${FONT_NAME}.zip" "$DOWNLOAD_URL"; then
        echo "  ✗ Failed to download ${FONT_NAME}, skipping..."
        continue
    fi

    echo "  Extracting..."
    unzip -q "$TMP_DIR/${FONT_NAME}.zip" -d "$TMP_DIR/${FONT_NAME}"

    echo "  Installing to $FONT_DIR..."
    # Install only .ttf and .otf files, excluding Windows-compatible variants
    find "$TMP_DIR/${FONT_NAME}" -type f \( -name "*.ttf" -o -name "*.otf" \) \
        ! -name "*Windows Compatible*" \
        -exec cp {} "$FONT_DIR/" \;

    echo "  ✓ ${FONT_NAME} installed successfully!"
done

echo ""
echo "Installing local fonts from $CUSTOM_FONT_DIR..."
if [[ -d "$CUSTOM_FONT_DIR" ]]; then
    LOCAL_FONT_COUNT=0
    while IFS= read -r -d '' FONT_FILE; do
        cp "$FONT_FILE" "$FONT_DIR/"
        LOCAL_FONT_COUNT=$((LOCAL_FONT_COUNT + 1))
    done < <(find "$CUSTOM_FONT_DIR" -type f \( -iname "*.ttf" -o -iname "*.otf" \) -print0)

    if ((LOCAL_FONT_COUNT > 0)); then
        echo "  ✓ Installed ${LOCAL_FONT_COUNT} local font file(s)"
    else
        echo "  - No local .ttf or .otf fonts found, skipping..."
    fi
else
    echo "  - Local fonts directory not found, skipping..."
fi

# Cleanup
rm -rf "$TMP_DIR"

echo ""
echo "Updating font cache..."
fc-cache -f "$FONT_DIR"

echo "✓ All fonts installed successfully!"
