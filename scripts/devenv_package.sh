#!/usr/bin/env bash

set -euo pipefail

# Script to package and install opencode from Docker container for offline deployment
# Usage: ./devenv_package.sh [OPTIONS] [output_directory]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="${PWD}"
CONTAINER_NAME="opencode-package-temp"
IMAGE_NAME=""
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
PACKAGE_NAME="opencode-offline-${TIMESTAMP}.tar.gz"
INSTALL_MODE=false
INSTALL_PACKAGE=""

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >&2
}

error() {
    log "ERROR: $*"
    exit 1
}

install_package() {
    local package_file="$1"
    
    if [[ ! -f "$package_file" ]]; then
        error "Package file does not exist: $package_file"
    fi
    
    log "Installing opencode from package: $package_file"
    
    # Create temporary directory for extraction
    local temp_dir=$(mktemp -d)
    trap "rm -rf '$temp_dir'" EXIT
    
    # Extract package
    log "Extracting package..."
    tar -xzf "$package_file" -C "$temp_dir"
    
    # Check if extraction was successful
    if [[ ! -f "$temp_dir/install.sh" ]]; then
        error "Invalid package: install.sh not found"
    fi
    
    # Run installation
    log "Running installation..."
    cd "$temp_dir"
    ./install.sh
    
    log "Installation completed successfully!"
    log "opencode is now available at ~/.opencode/bin/opencode"
    
    # Test installation
    if command -v opencode >/dev/null 2>&1; then
        local version=$(opencode --version 2>/dev/null || echo "unknown")
        log "✓ opencode is available in PATH (version: $version)"
    else
        log "⚠ opencode not found in PATH. Restart your shell or run:"
        log "  export PATH=\"\$HOME/.opencode/bin:\$PATH\""
    fi
}

usage() {
    cat <<EOF
Usage: $0 [OPTIONS] [output_directory]

Package or install opencode with all dependencies for offline deployment.

Options:
  --package             Create a package (default mode)
  --install PACKAGE     Install from existing package file
  --image IMAGE_NAME    Specify Docker image to use (package mode only)
  --help, -h           Show this help message

Arguments:
  output_directory    Directory to save the package (package mode, default: current directory)

Examples:
  # Package mode (default)
  $0                                        # Auto-detect image, save to current directory
  $0 /tmp/packages                          # Auto-detect image, save to /tmp/packages
  $0 --image my-devenv:latest /tmp/packages # Use specific image

  # Install mode
  $0 --install opencode-offline-20250901_094359.tar.gz
  $0 --install /path/to/package.tar.gz

Package Output:
  Creates opencode-offline-YYYYMMDD_HHMMSS.tar.gz containing:
  - ~/.opencode/bin/opencode (executable)
  - ~/.cache/opencode/ (cached dependencies)

Install Output:
  Extracts and installs opencode to:
  - ~/.opencode/bin/opencode
  - ~/.cache/opencode/
  - Updates PATH in shell RC file
EOF
}

cleanup() {
    log "Cleaning up..."
    docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --package)
            INSTALL_MODE=false
            shift
            ;;
        --install)
            INSTALL_MODE=true
            INSTALL_PACKAGE="$2"
            shift 2
            ;;
        --image)
            IMAGE_NAME="$2"
            shift 2
            ;;
        --help|-h)
            usage
            exit 0
            ;;
        -*)
            error "Unknown option: $1"
            ;;
        *)
            if [[ $INSTALL_MODE == false ]]; then
                OUTPUT_DIR="$1"
            fi
            shift
            ;;
    esac
done

# Handle install mode
if [[ $INSTALL_MODE == true ]]; then
    if [[ -z "$INSTALL_PACKAGE" ]]; then
        error "Package file required for install mode. Use --install <package_file>"
    fi
    install_package "$INSTALL_PACKAGE"
    exit 0
fi

# Continue with package mode
trap cleanup EXIT

# Auto-detect image if not specified
if [[ -z "$IMAGE_NAME" ]]; then
    log "Auto-detecting Docker image with opencode..."
    
    # Look for images that likely contain opencode
    CANDIDATE_IMAGES=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep -E "(devenv|opencode)" | grep -v "<none>" | head -5)
    
    if [[ -z "$CANDIDATE_IMAGES" ]]; then
        error "No suitable Docker images found. Please specify with --image or build a container with opencode installed."
    fi
    
    log "Found candidate images:"
    echo "$CANDIDATE_IMAGES" | while read -r img; do
        log "  - $img"
    done
    
    # Use the first (most recent) candidate
    IMAGE_NAME=$(echo "$CANDIDATE_IMAGES" | head -1)
    log "Using image: $IMAGE_NAME"
fi

# Validate output directory
if [[ ! -d "$OUTPUT_DIR" ]]; then
    error "Output directory does not exist: $OUTPUT_DIR"
fi

# Convert to absolute path
OUTPUT_DIR=$(realpath "$OUTPUT_DIR")
OUTPUT_PATH="$OUTPUT_DIR/$PACKAGE_NAME"

log "Starting opencode packaging process..."
log "Output will be saved to: $OUTPUT_PATH"

# Check if Docker image exists
if ! docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "^${IMAGE_NAME}$"; then
    error "Docker image '$IMAGE_NAME' not found. Available images:"
    docker images --format "table {{.Repository}}:{{.Tag}}" | grep -v "<none>"
    exit 1
fi

# Start container to extract files
log "Starting temporary container from image: $IMAGE_NAME"
docker run -d --name "$CONTAINER_NAME" "$IMAGE_NAME" sleep 3600

# Create temporary directory for packaging
TEMP_DIR=$(mktemp -d)
trap "rm -rf '$TEMP_DIR'; cleanup" EXIT

log "Extracting opencode files from container..."

# Create directory structure
mkdir -p "$TEMP_DIR/.opencode/bin"
mkdir -p "$TEMP_DIR/.cache"

# Copy opencode executable
log "Copying opencode executable..."
if docker exec "$CONTAINER_NAME" test -f /usr/local/bin/opencode; then
    # Check if it's a symlink and resolve it
    if docker exec "$CONTAINER_NAME" test -L /usr/local/bin/opencode; then
        log "Resolving symlink..."
        REAL_PATH=$(docker exec "$CONTAINER_NAME" readlink -f /usr/local/bin/opencode)
        log "Real path: $REAL_PATH"
        docker cp "$CONTAINER_NAME:$REAL_PATH" "$TEMP_DIR/.opencode/bin/opencode"
    else
        docker cp "$CONTAINER_NAME:/usr/local/bin/opencode" "$TEMP_DIR/.opencode/bin/opencode"
    fi
    chmod +x "$TEMP_DIR/.opencode/bin/opencode"
    
    # Get opencode version and update package name
    log "Getting opencode version..."
    OPENCODE_VERSION=$(docker exec "$CONTAINER_NAME" opencode --version 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo "unknown")
    log "OpenCode version: $OPENCODE_VERSION"
    
    # Update package name with version
    if [[ "$OPENCODE_VERSION" != "unknown" ]]; then
        PACKAGE_NAME="opencode-v${OPENCODE_VERSION}-offline-${TIMESTAMP}.tar.gz"
        OUTPUT_PATH="$OUTPUT_DIR/$PACKAGE_NAME"
        log "Updated package name: $PACKAGE_NAME"
    fi
else
    error "opencode executable not found in container at /usr/local/bin/opencode"
fi

# Copy cached dependencies
log "Copying cached dependencies..."
if docker exec "$CONTAINER_NAME" test -d /home/leodev/.cache/opencode; then
    docker cp "$CONTAINER_NAME:/home/leodev/.cache/opencode" "$TEMP_DIR/.cache/"
else
    log "WARNING: No cached dependencies found at /home/leodev/.cache/opencode"
    mkdir -p "$TEMP_DIR/.cache/opencode"
fi

# Create installation script
log "Creating installation script..."
cat > "$TEMP_DIR/install.sh" << 'EOF'
#!/usr/bin/env bash

set -euo pipefail

INSTALL_DIR="${HOME}/.opencode"
CACHE_DIR="${HOME}/.cache"

echo "Installing opencode offline package..."

# Create directories
mkdir -p "$INSTALL_DIR/bin"
mkdir -p "$CACHE_DIR"

# Copy files
cp -r .opencode/* "$INSTALL_DIR/"
cp -r .cache/* "$CACHE_DIR/"

# Make executable
chmod +x "$INSTALL_DIR/bin/opencode"

# Add to PATH if not already there
SHELL_RC=""
if [[ -f "$HOME/.bashrc" ]]; then
    SHELL_RC="$HOME/.bashrc"
elif [[ -f "$HOME/.zshrc" ]]; then
    SHELL_RC="$HOME/.zshrc"
fi

if [[ -n "$SHELL_RC" ]]; then
    if ! grep -q "\.opencode/bin" "$SHELL_RC"; then
        echo 'export PATH="$HOME/.opencode/bin:$PATH"' >> "$SHELL_RC"
        echo "Added opencode to PATH in $SHELL_RC"
        echo "Run 'source $SHELL_RC' or restart your shell to use opencode"
    fi
fi

echo "Installation complete!"
echo "opencode executable installed to: $INSTALL_DIR/bin/opencode"
echo "Cached dependencies installed to: $CACHE_DIR/opencode"

# Test installation
if command -v opencode >/dev/null 2>&1; then
    echo "✓ opencode is available in PATH"
else
    echo "⚠ opencode not found in PATH. You may need to restart your shell or run:"
    echo "  export PATH=\"\$HOME/.opencode/bin:\$PATH\""
fi
EOF

chmod +x "$TEMP_DIR/install.sh"

# Create README
log "Creating README..."
cat > "$TEMP_DIR/README.md" << EOF
# OpenCode Offline Package

This package contains a pre-built opencode installation with all dependencies for offline deployment.

## Contents

- \`.opencode/bin/opencode\` - The opencode executable
- \`.cache/opencode/\` - Pre-installed AI SDK dependencies
- \`install.sh\` - Installation script
- \`README.md\` - This file

## Installation

1. Extract this package:
   \`\`\`bash
   tar -xzf $(basename "$PACKAGE_NAME")
   cd opencode-offline-*
   \`\`\`

2. Run the installation script:
   \`\`\`bash
   ./install.sh
   \`\`\`

3. Restart your shell or run:
   \`\`\`bash
   source ~/.bashrc  # or ~/.zshrc
   \`\`\`

## Manual Installation

If you prefer manual installation:

1. Copy files to your home directory:
   \`\`\`bash
   cp -r .opencode ~/
   cp -r .cache ~/
   chmod +x ~/.opencode/bin/opencode
   \`\`\`

2. Add to your PATH:
   \`\`\`bash
   export PATH="\$HOME/.opencode/bin:\$PATH"
   \`\`\`

## Usage

After installation, you can use opencode normally:
\`\`\`bash
opencode --help
opencode auth login
\`\`\`

## Package Info

- Created: $(date)
- Source: Docker image '$IMAGE_NAME'
- Includes pre-cached AI SDK dependencies for offline use
EOF

# Create the tarball
log "Creating tarball: $PACKAGE_NAME"
cd "$TEMP_DIR"
tar -czf "$OUTPUT_PATH" .

# Get package size
PACKAGE_SIZE=$(du -h "$OUTPUT_PATH" | cut -f1)

log "Package created successfully!"
log "Location: $OUTPUT_PATH"
log "Size: $PACKAGE_SIZE"
log ""
log "To deploy on offline machine:"
log "1. Copy $PACKAGE_NAME to target machine"
log "2. Extract: tar -xzf $PACKAGE_NAME"
log "3. Run: ./install.sh"