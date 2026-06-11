#!/usr/bin/env bash

set -Eeuo pipefail

DEFAULT_ARCHIVES_DIR="/mnt/ch03pool/murten_mirror/shannon/linux/tools/opencode"
ARCHIVES_DIR="${OPENCODE_ARCHIVES_DIR:-$DEFAULT_ARCHIVES_DIR}"
ARCHIVE_PATH=""
FORCE_INSTALL=false
TEMP_DIR=""
TARGET_OPENCODE_DIR="$HOME/.opencode"
TARGET_CACHE_DIR="$HOME/.cache/opencode"
TARGET_BIN_DIR="$HOME/.local/bin"

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

Install or update the offline opencode bundle on a machine without npm access.
By default the script looks for the newest archive in:
  $DEFAULT_ARCHIVES_DIR

Options:
  --archive PATH        Install a specific archive instead of the newest one in the archive directory
  --archives-dir DIR    Override the directory searched for archives
  --force               Reinstall even if the same package is already installed
  --help, -h            Show this help message

Examples:
  $(basename "$0")
  $(basename "$0") --force
  $(basename "$0") --archive /mnt/share/opencode/opencode-v1.17.0-offline-20260611_120000.tar.gz
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

run_opencode_version() {
    local launcher="$TARGET_BIN_DIR/opencode"
    local command_path="$TARGET_OPENCODE_DIR/bin/opencode"
    if [[ -x "$launcher" ]]; then
        command_path="$launcher"
    fi

    if command -v timeout >/dev/null 2>&1; then
        timeout 20s "$command_path" --version 2>/dev/null | head -1 | tr -d '[:space:]' || true
    else
        "$command_path" --version 2>/dev/null | head -1 | tr -d '[:space:]' || true
    fi
}

package_version() {
    local manifest_file="$TARGET_OPENCODE_DIR/manifest.env"
    if [[ -f "$manifest_file" ]]; then
        # shellcheck disable=SC1090
        source "$manifest_file"
        printf '%s\n' "${OPENCODE_VERSION:-}"
    fi
}

find_latest_archive() {
    if [[ ! -d "$ARCHIVES_DIR" ]]; then
        log "Archive directory not accessible, attempting to mount: $ARCHIVES_DIR"
        sudo mount -a || true
    fi

    [[ -d "$ARCHIVES_DIR" ]] || error "Archive directory not found: $ARCHIVES_DIR"

    shopt -s nullglob
    local archives=("$ARCHIVES_DIR"/opencode-v*-offline-*.tar.gz)
    shopt -u nullglob

    (( ${#archives[@]} > 0 )) || error "No opencode offline archives found in $ARCHIVES_DIR"

    ls -1t "${archives[@]}" | head -1
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

load_manifest_env() {
    local manifest_file="$1"
    [[ -f "$manifest_file" ]] || error "Manifest not found: $manifest_file"

    # shellcheck disable=SC1090
    source "$manifest_file"
}

get_installed_package_info() {
    local manifest_file="$TARGET_OPENCODE_DIR/manifest.env"
    if [[ -f "$manifest_file" ]]; then
        # shellcheck disable=SC1090
        source "$manifest_file"
        printf '%s\t%s\n' "${OPENCODE_VERSION:-}" "${PACKAGE_HASH:-}"
        return 0
    fi

    printf '\t\n'
}

install_archive() {
    log "Running archive installer"
    (
        cd "$TEMP_DIR"
        ./install.sh
    )
    log "Archive installer finished"
}

verify_installation() {
    [[ -x "$TARGET_OPENCODE_DIR/bin/opencode" ]] || error "opencode binary not found at $TARGET_OPENCODE_DIR/bin/opencode"

    if [[ -x "$TARGET_BIN_DIR/opencode" ]]; then
        log "✓ opencode launcher installed at $TARGET_BIN_DIR/opencode"
    else
        log "⚠ opencode launcher is missing or not executable at $TARGET_BIN_DIR/opencode"
    fi

    local installed_version
    installed_version="$(run_opencode_version)"
    if [[ -z "$installed_version" ]]; then
        installed_version="$(package_version)"
        log "⚠ opencode startup check did not return a version within 20s; using package manifest version"
    fi
    [[ -n "$installed_version" ]] || error "opencode installed, but version is unavailable from both startup check and manifest"

    log "Installed opencode version: $installed_version"

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

    local archive_version="${OPENCODE_VERSION:-}"
    local archive_hash="${PACKAGE_HASH:-}"

    local installed_info installed_version installed_hash
    installed_info="$(get_installed_package_info)"
    installed_version="${installed_info%%$'\t'*}"
    installed_hash="${installed_info#*$'\t'}"

    if [[ "$FORCE_INSTALL" != true && -n "$archive_version" && "$archive_version" == "$installed_version" && "$archive_hash" == "$installed_hash" ]]; then
        log "✓ opencode ${installed_version} is already installed (package unchanged)"
        exit 0
    fi

    log "Installing archive: $(basename "$ARCHIVE_PATH")"
    install_archive
    verify_installation

    log "✅ opencode offline update completed"
}

main "$@"
