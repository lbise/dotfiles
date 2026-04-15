#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
DEFAULT_ARCHIVES_DIR="/mnt/ch03pool/murten_mirror/shannon/linux/tools/pi"
ARCHIVES_DIR="${PI_ARCHIVES_DIR:-$DEFAULT_ARCHIVES_DIR}"
FORCE_INSTALL=false
ARCHIVE_PATH=""
TARGET_RUNTIME_DIR="$HOME/.local/share/pi-runtime"
TARGET_BIN_DIR="$HOME/.local/bin"
TEMP_DIR=""

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >&2
}

error() {
    log "ERROR: $*"
    exit 1
}

usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Install or update the offline pi bundle on a machine without npm access.
By default the script looks for the newest archive in:
  $DEFAULT_ARCHIVES_DIR

Options:
  --archive PATH        Install a specific archive instead of the newest one in the archive directory
  --archives-dir DIR    Override the directory searched for archives
  --force               Reinstall even if the same pi + Node versions are already installed
  --help, -h            Show this help message

Examples:
  $(basename "$0")
  $(basename "$0") --force
  $(basename "$0") --archive /mnt/share/pi/pi-v0.67.1-node20.11.1-offline-20260415_120000.tar.gz
EOF
}

cleanup() {
    if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
        rm -rf "$TEMP_DIR"
    fi
}

ensure_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        error "Missing required command: $1"
    fi
}

check_dependencies() {
    log "Checking update dependencies..."
    for cmd in tar mktemp; do
        ensure_command "$cmd"
    done
    log "✓ Dependencies available"
}

find_latest_archive() {
    [[ -d "$ARCHIVES_DIR" ]] || {
        log "Archive directory not accessible, attempting to mount: $ARCHIVES_DIR"
        sudo mount -a || true
    }

    [[ -d "$ARCHIVES_DIR" ]] || error "Archive directory not found: $ARCHIVES_DIR"

    shopt -s nullglob
    local archives=("$ARCHIVES_DIR"/pi-v*-node*-offline-*.tar.gz)
    shopt -u nullglob

    (( ${#archives[@]} > 0 )) || error "No pi offline archives found in $ARCHIVES_DIR"

    ls -1t "${archives[@]}" | head -1
}

load_manifest_env() {
    local manifest_file="$1"
    [[ -f "$manifest_file" ]] || error "Manifest not found: $manifest_file"

    # shellcheck disable=SC1090
    source "$manifest_file"
}

get_installed_versions() {
    if [[ -f "$TARGET_RUNTIME_DIR/manifest.env" ]]; then
        # shellcheck disable=SC1090
        source "$TARGET_RUNTIME_DIR/manifest.env"
        printf '%s\t%s\t%s\n' "${PI_VERSION:-}" "${NODE_VERSION:-}" "${MANIFEST_HASH:-}"
        return 0
    fi

    printf '\t\t\n'
}

extract_archive() {
    local archive="$1"
    TEMP_DIR="$(mktemp -d)"
    trap cleanup EXIT

    log "Extracting $(basename "$archive")"
    tar -xzf "$archive" -C "$TEMP_DIR"

    [[ -f "$TEMP_DIR/install.sh" ]] || error "Invalid archive: install.sh not found"
    [[ -f "$TEMP_DIR/manifest.env" ]] || error "Invalid archive: manifest.env not found"
}

install_archive() {
    log "Running archive installer"
    (
        cd "$TEMP_DIR"
        ./install.sh
    )
}

verify_installation() {
    if [[ -f "$TARGET_RUNTIME_DIR/manifest.env" ]]; then
        # shellcheck disable=SC1090
        source "$TARGET_RUNTIME_DIR/manifest.env"
        log "Installed pi version: ${PI_VERSION:-unknown}"
        log "Bundled Node version: ${NODE_VERSION:-unknown}"
    fi

    if [[ -x "$TARGET_BIN_DIR/pi" ]]; then
        log "✓ pi wrapper installed at $TARGET_BIN_DIR/pi"
    else
        log "⚠ pi wrapper not found at $TARGET_BIN_DIR/pi"
    fi

    if [[ ":$PATH:" != *":$TARGET_BIN_DIR:"* ]]; then
        log "⚠ $TARGET_BIN_DIR is not in PATH. Add this to your shell profile:"
        log "    export PATH=\"$TARGET_BIN_DIR:\$PATH\""
    fi
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --archive)
                ARCHIVE_PATH="$2"
                shift 2
                ;;
            --archives-dir)
                ARCHIVES_DIR="$2"
                shift 2
                ;;
            --force)
                FORCE_INSTALL=true
                shift
                ;;
            --help|-h)
                usage
                exit 0
                ;;
            -*)
                error "Unknown option: $1"
                ;;
            *)
                error "Unexpected argument: $1"
                ;;
        esac
    done
}

main() {
    parse_args "$@"
    check_dependencies

    if [[ -z "$ARCHIVE_PATH" ]]; then
        ARCHIVE_PATH="$(find_latest_archive)"
    fi

    [[ -f "$ARCHIVE_PATH" ]] || error "Archive not found: $ARCHIVE_PATH"
    ARCHIVE_PATH="$(realpath "$ARCHIVE_PATH")"

    extract_archive "$ARCHIVE_PATH"
    load_manifest_env "$TEMP_DIR/manifest.env"

    local archive_pi_version="${PI_VERSION:-}"
    local archive_node_version="${NODE_VERSION:-}"
    local archive_manifest_hash="${MANIFEST_HASH:-}"

    local installed_info
    installed_info="$(get_installed_versions)"
    local installed_pi_version="${installed_info%%$'\t'*}"
    local installed_rest="${installed_info#*$'\t'}"
    local installed_node_version="${installed_rest%%$'\t'*}"
    local installed_manifest_hash="${installed_rest#*$'\t'}"

    if [[ "$FORCE_INSTALL" != true && -n "$archive_pi_version" && -n "$installed_pi_version" && "$archive_pi_version" == "$installed_pi_version" && "$archive_node_version" == "$installed_node_version" && "$archive_manifest_hash" == "$installed_manifest_hash" ]]; then
        log "✓ pi ${installed_pi_version} with Node ${installed_node_version} is already installed (manifest unchanged)"
        exit 0
    fi

    log "Installing archive: $(basename "$ARCHIVE_PATH")"
    install_archive
    verify_installation

    log "✅ pi offline update completed"
}

main "$@"
