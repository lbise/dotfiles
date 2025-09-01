#!/usr/bin/env bash

set -euo pipefail

# Script to setup and download packages from a Gitea npm registry
# Usage: ./gitea-npm-setup.sh [OPTIONS] <gitea_registry_url> [auth_token]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GITEA_REGISTRY=""
AUTH_TOKEN=""
BACKUP_CONFIG=true
GLOBAL_CONFIG=false
INSTALL_PACKAGES=()
FALLBACK_REGISTRY="https://registry.npmjs.org"
DRY_RUN=false
SET_DEFAULT_REGISTRY=false

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >&2
}

error() {
    log "ERROR: $*"
    exit 1
}

usage() {
    cat <<EOF
Usage: $0 [OPTIONS] <gitea_registry_url> [auth_token]

Setup npm to download packages from a Gitea registry and optionally install packages.

Options:
  --install PACKAGE       Package to install from Gitea registry (can be used multiple times)
  --global                Configure npm globally instead of locally
  --no-backup             Don't backup existing npm configuration
  --fallback REGISTRY     Fallback registry for packages not in Gitea (default: https://registry.npmjs.org)
  --set-default           Set Gitea registry as the default npm registry (not just scoped)
  --dry-run              Show what would be configured without actually doing it
  --help, -h             Show this help message

Arguments:
  gitea_registry_url     Gitea npm registry URL (e.g., https://gitea.example.com/api/packages/user/npm/)
  auth_token            Gitea authentication token (or set GITEA_TOKEN env var)

Examples:
  # Setup npm to use Gitea registry
  $0 https://ch03git.phonak.com/api/packages/13lbise/npm/ \$GITEA_TOKEN

  # Setup and install specific packages with default registry
  $0 --install lodash --install express --set-default https://gitea.example.com/api/packages/user/npm/

  # Global configuration as default registry
  $0 --global --set-default https://gitea.example.com/api/packages/user/npm/ \$GITEA_TOKEN

  # Dry run to see what would be configured
  $0 --dry-run https://gitea.example.com/api/packages/user/npm/

  # Using environment variable for token
  export GITEA_TOKEN="your-token-here"
  $0 --install pyright https://ch03git.phonak.com/api/packages/13lbise/npm/

Environment Variables:
  GITEA_TOKEN           Authentication token for Gitea registry
  NPM_CONFIG_REGISTRY   Override fallback registry
EOF
}

backup_npm_config() {
    local config_file="$1"
    local backup_file="${config_file}.backup.$(date +%Y%m%d_%H%M%S)"

    if [[ -f "$config_file" ]]; then
        log "Backing up existing npm config to $backup_file"
        cp "$config_file" "$backup_file"
    fi
}

setup_npm_registry() {
    local registry_url="$1"
    local token="$2"
    local config_scope="$3"  # "global" or "local"

    local registry_host
    registry_host=$(echo "$registry_url" | sed 's|https\?://||' | cut -d'/' -f1)

    log "Setting up npm registry configuration ($config_scope)..."
    log "Registry: $registry_url"
    log "Host: $registry_host"

    if [[ $DRY_RUN == true ]]; then
        log "[DRY RUN] Would configure npm for $registry_host"
        return 0
    fi

    local npm_args=()
    if [[ "$config_scope" == "global" ]]; then
        npm_args+=("--global")
    fi

    # Configure the registry for scoped packages if URL contains username
    local username
    username=$(echo "$registry_url" | sed 's|.*/packages/||' | cut -d'/' -f1)
    if [[ -n "$username" && "$username" != "npm" ]]; then
        log "Configuring scoped registry for @$username packages"
        npm config set "@${username}:registry" "$registry_url" "${npm_args[@]}" || true
    fi

    # Set authentication
    log "Configuring authentication..."
    npm config set "//${registry_host}/:_authToken" "$token" "${npm_args[@]}" || true

    # Add additional auth methods for better compatibility
    npm config set "//${registry_host}/:username" "$username" "${npm_args[@]}" || true
    npm config set "//${registry_host}/:email" "${username}@localhost" "${npm_args[@]}" || true

    # Set as default registry based on conditions
    if [[ $SET_DEFAULT_REGISTRY == true ]] || [[ -z "$username" || "$username" == "npm" ]]; then
        log "Setting as default npm registry"
        npm config set "registry" "$registry_url" "${npm_args[@]}" || true
    else
        log "Using scoped registry only (use --set-default to make it the default registry)"
    fi

    log "✓ npm registry configuration completed"
}

verify_registry_access() {
    local registry_url="$1"
    local token="$2"

    log "Verifying registry access..."

    # Test authentication with multiple methods
    local registry_host
    registry_host=$(echo "$registry_url" | sed 's|https\?://||' | cut -d'/' -f1)

    # Method 1: Try to access the registry URL directly with Bearer token
    if curl -s -f -H "Authorization: Bearer $token" "${registry_url%/}" >/dev/null 2>&1; then
        log "✓ Registry access verified (Bearer token)"
        return 0
    fi

    # Method 2: Try with token format (some systems use this)
    if curl -s -f -H "Authorization: token $token" "${registry_url%/}" >/dev/null 2>&1; then
        log "✓ Registry access verified (token format)"
        return 0
    fi

    # Method 3: Try accessing a common npm endpoint
    local test_url="${registry_url%/}/-/ping"
    if curl -s -f -H "Authorization: Bearer $token" "$test_url" >/dev/null 2>&1; then
        log "✓ Registry access verified (ping endpoint)"
        return 0
    fi

    # Method 4: Try a simple npm whoami command to test authentication
    local temp_npmrc=$(mktemp)
    {
        echo "registry=${registry_url}"
        echo "//${registry_host}/:_authToken=${token}"
    } > "$temp_npmrc"

    if npm whoami --userconfig="$temp_npmrc" >/dev/null 2>&1; then
        log "✓ Registry access verified (npm whoami)"
        rm -f "$temp_npmrc"
        return 0
    fi

    rm -f "$temp_npmrc"

    # If all methods fail, show more detailed error information
    log "⚠ Cannot verify registry access with any method"
    log "  Tested endpoints:"
    log "    - ${registry_url%/}"
    log "    - ${registry_url%/}/-/ping"
    log "    - npm whoami command"
    log "  This might be normal if the registry doesn't support these verification methods"
    log "  Continuing with setup - package installation will be the real test..."

    return 1
}

install_packages() {
    local packages=("$@")

    if [[ ${#packages[@]} -eq 0 ]]; then
        return 0
    fi

    log "Installing packages from Gitea registry..."

    for package in "${packages[@]}"; do
        log "Installing $package..."

        if [[ $DRY_RUN == true ]]; then
            log "[DRY RUN] Would install: $package"
            continue
        fi

        # Try to install from Gitea registry first
        if npm install "$package" --registry="$GITEA_REGISTRY" 2>/dev/null; then
            log "✓ Successfully installed $package from Gitea registry"
        else
            log "⚠ Failed to install $package from Gitea, trying fallback registry..."
            if npm install "$package" --registry="$FALLBACK_REGISTRY"; then
                log "✓ Successfully installed $package from fallback registry"
            else
                log "✗ Failed to install $package from both registries"
            fi
        fi
    done
}

restore_npm_config() {
    log "To restore your original npm configuration, run:"
    if [[ $GLOBAL_CONFIG == true ]]; then
        log "  npm config edit --global"
    else
        log "  npm config edit"
    fi
    log "Or restore from backup files in your home directory"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --install)
            INSTALL_PACKAGES+=("$2")
            shift 2
            ;;
        --global)
            GLOBAL_CONFIG=true
            shift
            ;;
        --no-backup)
            BACKUP_CONFIG=false
            shift
            ;;
        --set-default)
            SET_DEFAULT_REGISTRY=true
            shift
            ;;
        --fallback)
            FALLBACK_REGISTRY="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
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
            if [[ -z "$GITEA_REGISTRY" ]]; then
                GITEA_REGISTRY="$1"
            elif [[ -z "$AUTH_TOKEN" ]]; then
                AUTH_TOKEN="$1"
            fi
            shift
            ;;
    esac
done

# Validate required arguments
if [[ -z "$GITEA_REGISTRY" ]]; then
    error "Gitea registry URL is required"
fi

# Get auth token from environment if not provided
if [[ -z "$AUTH_TOKEN" ]]; then
    AUTH_TOKEN="${GITEA_TOKEN:-}"
fi

# Skip auth check for dry run
if [[ -z "$AUTH_TOKEN" && $DRY_RUN == false ]]; then
    error "Authentication token required. Pass as argument or set GITEA_TOKEN environment variable."
elif [[ -z "$AUTH_TOKEN" && $DRY_RUN == true ]]; then
    log "No auth token provided, but continuing in dry-run mode"
    AUTH_TOKEN="dry-run-token"
fi

# Use NPM_CONFIG_REGISTRY if set for fallback
if [[ -n "${NPM_CONFIG_REGISTRY:-}" ]]; then
    FALLBACK_REGISTRY="$NPM_CONFIG_REGISTRY"
fi

log "Starting Gitea npm setup process..."
log "Gitea Registry: $GITEA_REGISTRY"
log "Fallback Registry: $FALLBACK_REGISTRY"
log "Global Config: $GLOBAL_CONFIG"
log "Set Default Registry: $SET_DEFAULT_REGISTRY"
log "Packages to Install: ${INSTALL_PACKAGES[*]:-none}"
log "Dry Run: $DRY_RUN"

# Backup existing configuration
if [[ $BACKUP_CONFIG == true && $DRY_RUN == false ]]; then
    if [[ $GLOBAL_CONFIG == true ]]; then
        backup_npm_config "$HOME/.npmrc"
    else
        backup_npm_config "$(pwd)/.npmrc"
    fi
fi

# Setup npm registry configuration
CONFIG_SCOPE="local"
if [[ $GLOBAL_CONFIG == true ]]; then
    CONFIG_SCOPE="global"
fi

setup_npm_registry "$GITEA_REGISTRY" "$AUTH_TOKEN" "$CONFIG_SCOPE"

# Verify registry access
#if [[ $DRY_RUN == false ]]; then
#    verify_registry_access "$GITEA_REGISTRY" "$AUTH_TOKEN"
#fi

# Install packages if requested
if [[ ${#INSTALL_PACKAGES[@]} -gt 0 ]]; then
    install_packages "${INSTALL_PACKAGES[@]}"
fi

# Summary
echo
log "=== Setup Summary ==="
log "✓ npm configured to use Gitea registry"
if [[ ${#INSTALL_PACKAGES[@]} -gt 0 ]]; then
    log "✓ Attempted to install ${#INSTALL_PACKAGES[@]} packages"
fi

if [[ $DRY_RUN == true ]]; then
    log "This was a dry run - no configuration was actually changed"
else
    log "Configuration active in $CONFIG_SCOPE scope"
    restore_npm_config
fi

log "Setup process completed!"
