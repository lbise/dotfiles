#!/usr/bin/env bash

set -euo pipefail

# Development environment update script
# Installs opencode from archives and pyright from Gitea registry

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOTFILES_DIR="$(dirname "$SCRIPT_DIR")"
ARCHIVES_DIR="$(cd "$SCRIPT_DIR" && realpath ../archives)"
INSTALL_DIR="$HOME/.local/bin"
OPENCODE_INSTALL_DIR="$HOME/.local/share/opencode"

# Gitea configuration
GITEA_REGISTRY="https://ch03git.phonak.com/api/packages/13lbise/npm/"
GITEA_TOKEN="${GITEA_TOKEN:-}"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >&2
}

error() {
    log "ERROR: $*"
    exit 1
}

check_dependencies() {
    log "Checking dependencies..."

    local missing_deps=()

    # Check for required commands
    for cmd in curl tar npm; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            missing_deps+=("$cmd")
        fi
    done

    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        error "Missing required dependencies: ${missing_deps[*]}"
    fi

    log "✓ All dependencies available"
}

find_latest_opencode_archive() {
    log "Looking for opencode archives in $ARCHIVES_DIR..."

    local latest_archive=""
    local latest_version=""

    # Find all opencode archives and get the latest version
    for archive in "$ARCHIVES_DIR"/opencode-*.tar.gz; do
        if [[ -f "$archive" ]]; then
            local filename=$(basename "$archive")
            # Extract version from filename like "opencode-v0.5.28-offline-20250901_100609.tar.gz"
            local version=$(echo "$filename" | sed 's/opencode-v\([0-9.]*\).*/\1/')

            if [[ -n "$version" ]]; then
                if [[ -z "$latest_version" ]] || version_greater "$version" "$latest_version"; then
                    latest_version="$version"
                    latest_archive="$archive"
                fi
            fi
        fi
    done

    if [[ -z "$latest_archive" ]]; then
        error "No opencode archives found in $ARCHIVES_DIR"
    fi

    echo "$latest_archive"
}

version_greater() {
    # Simple version comparison - assumes semantic versioning
    local v1="$1"
    local v2="$2"

    # Convert versions to comparable numbers (simple approach)
    local v1_num=$(echo "$v1" | sed 's/\.//g' | sed 's/^0*//')
    local v2_num=$(echo "$v2" | sed 's/\.//g' | sed 's/^0*//')

    [[ ${v1_num:-0} -gt ${v2_num:-0} ]]
}

get_installed_opencode_version() {
    local version_file="$OPENCODE_INSTALL_DIR/version"
    if [[ -f "$version_file" ]]; then
        cat "$version_file"
    else
        echo ""
    fi
}

install_opencode() {
    local archive_path="$1"
    local archive_name=$(basename "$archive_path")

    log "Installing opencode from $archive_name..."

    # Extract version from archive name
    local version=$(echo "$archive_name" | sed 's/opencode-v\([0-9.]*\).*/\1/')

    # Check if already installed
    local installed_version=$(get_installed_opencode_version)
    if [[ -n "$installed_version" && "$installed_version" == "$version" ]]; then
        log "✓ opencode $version is already installed"
        return 0
    fi

    # Create installation directories
    mkdir -p "$INSTALL_DIR" "$OPENCODE_INSTALL_DIR"

    # Create temporary extraction directory
    local temp_dir=$(mktemp -d)
    trap "rm -rf '$temp_dir'" RETURN

    log "Extracting $archive_name..."
    tar -xzf "$archive_path" -C "$temp_dir"

    # Find the extracted opencode directory
    local opencode_dir
    opencode_dir=$(find "$temp_dir" -type d -name "opencode*" | head -1)

    if [[ -z "$opencode_dir" || ! -d "$opencode_dir" ]]; then
        error "Could not find opencode directory in archive"
    fi

    # Remove old installation if it exists
    if [[ -d "$OPENCODE_INSTALL_DIR" ]]; then
        log "Removing old opencode installation..."
        rm -rf "$OPENCODE_INSTALL_DIR"
        mkdir -p "$OPENCODE_INSTALL_DIR"
    fi

    # Move opencode to installation directory
    log "Installing opencode to $OPENCODE_INSTALL_DIR..."
    cp -r "$opencode_dir"/* "$OPENCODE_INSTALL_DIR/"

    # Create symlink in PATH
    local opencode_bin="$OPENCODE_INSTALL_DIR/bin/opencode"
    local symlink_path="$INSTALL_DIR/opencode"

    if [[ -f "$opencode_bin" ]]; then
        log "Creating symlink: $symlink_path -> $opencode_bin"
        ln -sf "$opencode_bin" "$symlink_path"
    else
        # Look for alternative binary locations
        local alt_bin=$(find "$OPENCODE_INSTALL_DIR" -name "opencode" -type f -executable | head -1)
        if [[ -n "$alt_bin" ]]; then
            log "Creating symlink: $symlink_path -> $alt_bin"
            ln -sf "$alt_bin" "$symlink_path"
        else
            log "⚠ Could not find opencode binary in installation"
        fi
    fi

    # Save version info
    echo "$version" > "$OPENCODE_INSTALL_DIR/version"

    log "✓ opencode $version installed successfully"
}

setup_gitea_npm() {
    log "Setting up Gitea npm registry..."

    if [[ -z "$GITEA_TOKEN" ]]; then
        log "⚠ GITEA_TOKEN not set, skipping npm setup"
        return 1
    fi

    # Use our gitea-npm-setup script
    local setup_script="$SCRIPT_DIR/gitea-npm-setup.sh"
    if [[ -f "$setup_script" ]]; then
        log "Using gitea-npm-setup.sh script..."
        "$setup_script" --set-default "$GITEA_REGISTRY" "$GITEA_TOKEN"
    else
        log "gitea-npm-setup.sh not found, setting up manually..."

        # Manual setup as fallback
        local registry_host
        registry_host=$(echo "$GITEA_REGISTRY" | sed 's|https\?://||' | cut -d'/' -f1)

        npm config set registry "$GITEA_REGISTRY"
        npm config set "//${registry_host}/:_authToken" "$GITEA_TOKEN"

        log "✓ npm configured for Gitea registry"
    fi
}

install_pyright() {
    log "Installing pyright from Gitea registry..."

    # Check if pyright is already installed and up to date
    if command -v pyright >/dev/null 2>&1; then
        local current_version
        current_version=$(pyright --version 2>/dev/null | grep -o '[0-9]\+\.[0-9]\+\.[0-9]\+' | head -1 || echo "unknown")
        log "Current pyright version: $current_version"
    fi

    # Try to install/update pyright
    if npm install -g pyright 2>/dev/null; then
        log "✓ pyright installed/updated successfully"

        # Verify installation
        if command -v pyright >/dev/null 2>&1; then
            local new_version
            new_version=$(pyright --version 2>/dev/null | grep -o '[0-9]\+\.[0-9]\+\.[0-9]\+' | head -1 || echo "unknown")
            log "✓ pyright version: $new_version"
        fi
    else
        log "⚠ Failed to install pyright from Gitea registry"

        # Fallback to public npm registry
        log "Trying fallback to public npm registry..."
        if npm install -g pyright --registry="https://registry.npmjs.org"; then
            log "✓ pyright installed from public npm registry"
        else
            log "✗ Failed to install pyright from both registries"
            return 1
        fi
    fi
}

verify_installation() {
    log "Verifying installations..."

    # Check opencode
    if command -v opencode >/dev/null 2>&1; then
        local opencode_version
        opencode_version=$(opencode --version 2>/dev/null | head -1 || echo "version unknown")
        log "✓ opencode: $opencode_version"
    else
        log "⚠ opencode not found in PATH (may need to restart shell)"
    fi

    # Check pyright
    if command -v pyright >/dev/null 2>&1; then
        local pyright_version
        pyright_version=$(pyright --version 2>/dev/null | head -1 || echo "version unknown")
        log "✓ pyright: $pyright_version"
    else
        log "⚠ pyright not found in PATH"
    fi

    # Check if PATH includes our install directory
    if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
        log "⚠ $INSTALL_DIR is not in PATH. Add this to your shell profile:"
        log "    export PATH=\"$INSTALL_DIR:\$PATH\""
    fi
}

main() {
    log "Starting development environment update..."

    # Check dependencies
    check_dependencies

    # Find and install opencode
    local opencode_archive
    opencode_archive=$(find_latest_opencode_archive)
    install_opencode "$opencode_archive"

    # Setup npm for Gitea registry
    if setup_gitea_npm; then
        # Install pyright from Gitea
        install_pyright
    else
        log "Skipping pyright installation (Gitea setup failed)"
    fi

    # Verify everything is working
    verify_installation

    log "✅ Development environment update completed!"

    # Cleanup note
    echo
    log "=== Post-Installation Notes ==="
    log "• Restart your shell or run: source ~/.bashrc (or ~/.zshrc)"
    log "• Verify opencode: opencode --version"
    log "• Verify pyright: pyright --version"
    log "• Installation location: $OPENCODE_INSTALL_DIR"
    log "• Binaries location: $INSTALL_DIR"
}

# Run main function
main "$@"
