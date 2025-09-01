#!/usr/bin/env bash

set -euo pipefail

# Script to mirror npm packages to a Gitea registry
# Usage: ./mirror-npm-package.sh [OPTIONS] <package_name> <gitea_registry_url> [auth_token]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_NAME=""
GITEA_REGISTRY=""
AUTH_TOKEN=""
PACKAGE_VERSION="latest"
DRY_RUN=false
INCLUDE_DEPS=false
SOURCE_REGISTRY="https://registry.npmjs.org"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >&2
}

error() {
    log "ERROR: $*"
    exit 1
}

usage() {
    cat <<EOF
Usage: $0 [OPTIONS] <package_name> <gitea_registry_url> [auth_token]

Mirror npm packages to a Gitea registry for offline use.

Options:
  --version VERSION     Specific version to mirror (default: latest)
  --include-deps        Also mirror all dependencies
  --source REGISTRY     Source npm registry (default: https://registry.npmjs.org)
  --dry-run            Show what would be mirrored without actually doing it
  --help, -h           Show this help message

Arguments:
  package_name         Name of the npm package to mirror (e.g., express, @types/node)
  gitea_registry_url   Gitea npm registry URL (e.g., https://gitea.example.com/api/packages/user/npm/)
  auth_token          Gitea authentication token (or set GITEA_TOKEN env var)

Examples:
  # Mirror latest version of express
  $0 express https://gitea.example.com/api/packages/myuser/npm/ \$GITEA_TOKEN

  # Mirror specific version with dependencies
  $0 --version 4.18.2 --include-deps express https://gitea.example.com/api/packages/myuser/npm/

  # Dry run to see what would be mirrored
  $0 --dry-run --include-deps react https://gitea.example.com/api/packages/myuser/npm/

  # Using environment variable for token
  export GITEA_TOKEN="your-token-here"
  $0 lodash https://gitea.example.com/api/packages/myuser/npm/

Environment Variables:
  GITEA_TOKEN         Authentication token for Gitea registry
  NPM_CONFIG_REGISTRY Override source registry
EOF
}

get_package_dependencies() {
    local pkg="$1"
    local version="$2"

    log "Fetching dependencies for $pkg@$version..."

    # Get package.json from registry
    local package_info
    if ! package_info=$(npm view "$pkg@$version" --json --registry="$SOURCE_REGISTRY" 2>/dev/null); then
        log "WARNING: Could not fetch package info for $pkg@$version"
        return
    fi

    # Extract dependencies using jq if available, otherwise use npm view directly
    if command -v jq >/dev/null 2>&1; then
        echo "$package_info" | jq -r '
            (.dependencies // {}) as $deps |
            (.devDependencies // {}) as $devDeps |
            (.peerDependencies // {}) as $peerDeps |
            ($deps + $devDeps + $peerDeps) |
            to_entries[] |
            "\(.key)@\(.value)"
        ' 2>/dev/null | sed 's/@\^/@/g; s/@~/@/g; s/@>=/@/g' | grep -v '@$'
    else
        log "jq not found, using npm view for dependencies..."
        # Fallback: use npm view to get dependencies
        {
            npm view "$pkg@$version" dependencies --json --registry="$SOURCE_REGISTRY" 2>/dev/null | grep -o '"[^"]*"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/"//g; s/: */@/g' || true
            npm view "$pkg@$version" devDependencies --json --registry="$SOURCE_REGISTRY" 2>/dev/null | grep -o '"[^"]*"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/"//g; s/: */@/g' || true
        } | sed 's/@\^/@/g; s/@~/@/g; s/@>=/@/g' | grep -v '@$' || true
    fi
}

mirror_package() {
    local pkg="$1"
    local version="$2"
    local is_dependency="${3:-false}"

    local prefix=""
    if [[ "$is_dependency" == "true" ]]; then
        prefix="  ↳ "
    fi

    log "${prefix}Mirroring $pkg@$version..."

    if [[ $DRY_RUN == true ]]; then
        log "${prefix}[DRY RUN] Would mirror: $pkg@$version"
        return 0
    fi

    # Create temporary directory
    local temp_dir=$(mktemp -d)
    trap "rm -rf '$temp_dir'" RETURN

    cd "$temp_dir"

    # Download package
    if ! npm pack "$pkg@$version" --registry="$SOURCE_REGISTRY" >/dev/null 2>&1; then
        log "${prefix}✗ Failed to download $pkg@$version"
        return 1
    fi

    # Find the downloaded tarball
    local tarball=$(find . -name "*.tgz" | head -1)
    if [[ -z "$tarball" ]]; then
        log "${prefix}✗ No tarball found for $pkg@$version"
        return 1
    fi

    # Publish to Gitea registry
    log "${prefix}Publishing to registry..."
    local publish_output
    local exit_code

    # Try different authentication approaches
    for auth_method in "standard" "bearer" "basic"; do
        case $auth_method in
            "standard")
                log "${prefix}Trying standard token authentication..."
                publish_output=$(npm publish "$tarball" --registry="$GITEA_REGISTRY" 2>&1)
                exit_code=$?
                # Check for authentication errors even with exit code 0
                if [[ $exit_code -eq 0 ]] && ! echo "$publish_output" | grep -q "ENEEDAUTH\|need auth\|requires you to be logged in"; then
                    log "${prefix}✓ Successfully mirrored $pkg@$version (standard auth)"
                    return 0
                fi
                ;;
            "bearer")
                log "${prefix}Trying bearer token authentication..."
                # Create temporary .npmrc with bearer token
                local temp_npmrc=$(mktemp)
                echo "//${REGISTRY_HOST}/:_authToken=${AUTH_TOKEN}" > "$temp_npmrc"
                publish_output=$(NPM_CONFIG_USERCONFIG="$temp_npmrc" npm publish "$tarball" --registry="$GITEA_REGISTRY" 2>&1)
                exit_code=$?
                rm -f "$temp_npmrc"
                # Check for authentication errors even with exit code 0
                if [[ $exit_code -eq 0 ]] && ! echo "$publish_output" | grep -q "ENEEDAUTH\|need auth\|requires you to be logged in"; then
                    log "${prefix}✓ Successfully mirrored $pkg@$version (bearer auth)"
                    return 0
                fi
                ;;
            "basic")
                log "${prefix}Trying basic auth with curl..."
                # Try using curl to upload directly (fallback method)
                local package_json
                package_json=$(tar -xzOf "$tarball" package/package.json 2>/dev/null)
                if [[ -n "$package_json" ]]; then
                    local pkg_name pkg_version
                    pkg_name=$(echo "$package_json" | grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
                    pkg_version=$(echo "$package_json" | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)

                    if [[ -n "$pkg_name" && -n "$pkg_version" ]]; then
                        log "${prefix}Attempting direct upload via curl..."
                        local curl_response
                        curl_response=$(curl -s -X PUT \
                            -H "Authorization: token ${AUTH_TOKEN}" \
                            -H "Content-Type: application/octet-stream" \
                            --data-binary "@$tarball" \
                            "${GITEA_REGISTRY%/}/$pkg_name/-/$pkg_name-$pkg_version.tgz" 2>&1)
                        exit_code=$?

                        # Check if curl succeeded and didn't return an error
                        if [[ $exit_code -eq 0 ]] && ! echo "$curl_response" | grep -qi "error\|fail"; then
                            log "${prefix}✓ Successfully uploaded via curl"
                            return 0
                        fi
                        log "${prefix}Curl response: $curl_response"
                    fi
                fi
                ;;
        esac

        log "${prefix}Auth method '$auth_method' failed with exit code $exit_code"

        # Check if it already exists (409 conflict is OK)
        if echo "$publish_output" | grep -q "409\|already exists\|conflict\|version already exists"; then
            log "${prefix}⚠ Package $pkg@$version already exists in registry"
            return 0
        fi
    done

    # All methods failed
    log "${prefix}Publish failed with all authentication methods"
    if [[ -n "$publish_output" ]]; then
        log "${prefix}Final error output: $publish_output"
    fi
    log "${prefix}✗ Failed to publish $pkg@$version to registry"
    return 1
}

resolve_version() {
    local pkg="$1"
    local version="$2"

    if [[ "$version" == "latest" ]]; then
        npm view "$pkg" version --registry="$SOURCE_REGISTRY" 2>/dev/null || echo "latest"
    else
        echo "$version"
    fi
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --version)
            PACKAGE_VERSION="$2"
            shift 2
            ;;
        --include-deps)
            INCLUDE_DEPS=true
            shift
            ;;
        --source)
            SOURCE_REGISTRY="$2"
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
            if [[ -z "$PACKAGE_NAME" ]]; then
                PACKAGE_NAME="$1"
            elif [[ -z "$GITEA_REGISTRY" ]]; then
                GITEA_REGISTRY="$1"
            elif [[ -z "$AUTH_TOKEN" ]]; then
                AUTH_TOKEN="$1"
            fi
            shift
            ;;
    esac
done

# Validate required arguments
if [[ -z "$PACKAGE_NAME" ]]; then
    error "Package name is required"
fi

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

# Use NPM_CONFIG_REGISTRY if set
if [[ -n "${NPM_CONFIG_REGISTRY:-}" ]]; then
    SOURCE_REGISTRY="$NPM_CONFIG_REGISTRY"
fi

log "Starting npm package mirror process..."
log "Package: $PACKAGE_NAME@$PACKAGE_VERSION"
log "Source: $SOURCE_REGISTRY"
log "Target: $GITEA_REGISTRY"
log "Include dependencies: $INCLUDE_DEPS"
log "Dry run: $DRY_RUN"

# Setup npm authentication for Gitea
if [[ $DRY_RUN == false ]]; then
    REGISTRY_HOST=$(echo "$GITEA_REGISTRY" | sed 's|https\?://||' | cut -d'/' -f1)

    log "Setting up authentication for $REGISTRY_HOST..."

    # For Gitea, try multiple authentication approaches
    # Method 1: _authToken (already tried)
    NPM_RC_LINE="//${REGISTRY_HOST}/:_authToken=${AUTH_TOKEN}"

    # Add to user's .npmrc if not already there
    if ! grep -q "$REGISTRY_HOST" ~/.npmrc 2>/dev/null; then
        echo "$NPM_RC_LINE" >> ~/.npmrc
        log "Added authentication to ~/.npmrc"
    else
        # Update existing entry
        sed -i "s|//${REGISTRY_HOST}/:_authToken=.*|${NPM_RC_LINE}|" ~/.npmrc
        log "Updated authentication in ~/.npmrc"
    fi

    # Method 2: Also try username-based auth for Gitea
    # Extract username from registry URL (13lbise in this case)
    USERNAME=$(echo "$GITEA_REGISTRY" | sed 's|.*/packages/||' | cut -d'/' -f1)
    if [[ -n "$USERNAME" ]]; then
        log "Detected username: $USERNAME"

        # Add username and email for npm login compatibility
        echo "//${REGISTRY_HOST}/:username=${USERNAME}" >> ~/.npmrc
        echo "//${REGISTRY_HOST}/:email=${USERNAME}@localhost" >> ~/.npmrc

        # Try base64 encoded auth as well
        BASE64_AUTH=$(echo -n "${USERNAME}:${AUTH_TOKEN}" | base64)
        echo "//${REGISTRY_HOST}/:_auth=${BASE64_AUTH}" >> ~/.npmrc

        log "Added username-based authentication entries"
    fi

    # Also set via npm config (skip always-auth as it's not supported in all npm versions)
    npm config set "//${REGISTRY_HOST}/:_authToken" "$AUTH_TOKEN"

    log "Configured npm authentication for $REGISTRY_HOST"
    log "Registry host: $REGISTRY_HOST"
    log "Auth token configured: ${AUTH_TOKEN:0:8}..."
    if [[ -n "$USERNAME" ]]; then
        log "Username: $USERNAME"
    fi

    # Method 3: Try npm login approach for Gitea
    log "Attempting npm login to registry..."

    # Create a temporary .npmrc specifically for this registry
    TEMP_NPMRC=$(mktemp)
    cp ~/.npmrc "$TEMP_NPMRC" 2>/dev/null || touch "$TEMP_NPMRC"

    # Set registry-specific config
    echo "registry=$GITEA_REGISTRY" >> "$TEMP_NPMRC"
    echo "//${REGISTRY_HOST}/:_authToken=${AUTH_TOKEN}" >> "$TEMP_NPMRC"

    # Try setting up auth via npm whoami first to test
    export NPM_CONFIG_USERCONFIG="$TEMP_NPMRC"
    if npm whoami --registry="$GITEA_REGISTRY" >/dev/null 2>&1; then
        log "✓ npm whoami succeeded, authentication looks good"
    else
        log "⚠ npm whoami failed, but continuing with publish attempt"
    fi

    # Clean up temp file
    rm -f "$TEMP_NPMRC"
    unset NPM_CONFIG_USERCONFIG
fi

# Resolve actual version
RESOLVED_VERSION=$(resolve_version "$PACKAGE_NAME" "$PACKAGE_VERSION")
log "Resolved version: $RESOLVED_VERSION"

# Mirror main package
MAIN_SUCCESS=true
if ! mirror_package "$PACKAGE_NAME" "$RESOLVED_VERSION"; then
    MAIN_SUCCESS=false
fi

# Mirror dependencies if requested
DEPS_SUCCESS=true
DEPS_COUNT=0
if [[ $INCLUDE_DEPS == true ]]; then
    log "Processing dependencies..."

    # Get dependencies
    DEPS_FILE=$(mktemp)
    get_package_dependencies "$PACKAGE_NAME" "$RESOLVED_VERSION" > "$DEPS_FILE"
    DEPS_COUNT=$(wc -l < "$DEPS_FILE")

    if [[ $DEPS_COUNT -gt 0 ]]; then
        log "Found $DEPS_COUNT dependencies to mirror"

        while IFS= read -r dep; do
            [[ -z "$dep" ]] && continue

            # Parse package name and version
            if [[ "$dep" =~ ^(@?[^@]+)@(.+)$ ]]; then
                dep_name="${BASH_REMATCH[1]}"
                dep_version="${BASH_REMATCH[2]}"

                # Skip invalid version ranges for now
                if [[ "$dep_version" =~ ^[0-9] ]]; then
                    if ! mirror_package "$dep_name" "$dep_version" "true"; then
                        DEPS_SUCCESS=false
                    fi
                else
                    log "  ↳ Skipping $dep_name (complex version range: $dep_version)"
                fi
            fi
        done < "$DEPS_FILE"
    else
        log "No dependencies found"
    fi

    rm -f "$DEPS_FILE"
fi

# Summary
echo
log "=== Mirror Summary ==="
if [[ $MAIN_SUCCESS == true ]]; then
    log "✓ Main package: $PACKAGE_NAME@$RESOLVED_VERSION"
else
    log "✗ Main package: $PACKAGE_NAME@$RESOLVED_VERSION"
fi

if [[ $INCLUDE_DEPS == true ]]; then
    if [[ $DEPS_SUCCESS == true ]]; then
        log "✓ Dependencies: $DEPS_COUNT processed successfully"
    else
        log "⚠ Dependencies: $DEPS_COUNT processed with some failures"
    fi
fi

if [[ $DRY_RUN == true ]]; then
    log "This was a dry run - no packages were actually mirrored"
fi

log "Mirror process completed!"

# Exit with error if main package failed
if [[ $MAIN_SUCCESS == false ]]; then
    exit 1
fi
