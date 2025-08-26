#!/usr/bin/env bash

set -euo pipefail

# Script to build, configure, and push a new devenv docker image
# Process:
# 1. Build the docker image
# 2. Open interactive shell for manual configuration (github copilot login)
# 3. Commit the configured container
# 4. Push the new image

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOCKER_COMPOSE_FILE="docker/docker-compose.build.yml"
IMAGE_NAME="ch03git.phonak.com/13lbise/devenv"
CONTAINER_NAME="devenv_build_$(date +%s)"
TEMP_CONTAINER_NAME="devenv_temp_$(date +%s)"

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*"
}

success() {
    echo -e "${GREEN}✓${NC} $*"
}

warning() {
    echo -e "${YELLOW}⚠${NC} $*"
}

error() {
    echo -e "${RED}✗${NC} $*" >&2
}

cleanup() {
    local exit_code=$?
    log "Cleaning up temporary containers..."

    # Stop and remove temporary containers if they exist
    if docker ps -a --format "table {{.Names}}" | grep -q "^${TEMP_CONTAINER_NAME}$"; then
        docker rm -f "${TEMP_CONTAINER_NAME}" 2>/dev/null || true
    fi

    exit $exit_code
}

trap cleanup EXIT

main() {
    log "Starting devenv docker image build process"

    # Check if we're in the right directory
    if [[ ! -f "${DOCKER_COMPOSE_FILE}" ]]; then
        error "Docker compose file not found: ${DOCKER_COMPOSE_FILE}"
        error "Please run this script from the leo_dotfiles root directory"
        exit 1
    fi

    # Check required environment variables
    if [[ -z "${AZURE_RESOURCE_NAME:-}" ]] || [[ -z "${AZURE_API_KEY:-}" ]]; then
        warning "AZURE_RESOURCE_NAME and AZURE_API_KEY environment variables should be set"
        warning "The build will continue but Azure OpenAI may not work in the container"
    fi

    # Step 1: Build the docker image
    log "Building docker image..."
    if ! docker compose -f "${DOCKER_COMPOSE_FILE}" build; then
        error "Docker build failed"
        exit 1
    fi
    success "Docker image built successfully"

    # Step 2: Start container for configuration
    log "Starting temporary container for configuration..."
    docker run -d \
        --name "${TEMP_CONTAINER_NAME}" \
        --tty \
        --interactive \
        --volume "/home/13lbise/gitrepo/leo_dotfiles:/home/leodev/gitrepo/leo_dotfiles:rw" \
        --volume "/home/13lbise/andromeda:/home/leodev/andromeda:rw" \
        --env "DISPLAY=${DISPLAY:-}" \
        --env "TERM=${TERM:-xterm-256color}" \
        --env "AZURE_RESOURCE_NAME=${AZURE_RESOURCE_NAME:-}" \
        --env "AZURE_API_KEY=${AZURE_API_KEY:-}" \
        --network host \
        --workdir "/home/leodev" \
        "${IMAGE_NAME}:latest" \
        sleep infinity

    success "Container started: ${TEMP_CONTAINER_NAME}"

    # Step 3: Interactive configuration
    echo ""
    log "Opening interactive shell for manual configuration..."
    warning "Please perform the following manual steps:"
    warning "1. Login to GitHub Copilot: opencode auth login"
    warning "2. Test that GitHub Copilot works: opencode -m github-copilot/gpt-4 run 'hello'"
    warning "3. Perform any other necessary configuration"
    warning "4. Type 'exit' when done"
    echo ""

    # Open interactive shell
    if ! docker exec -it "${TEMP_CONTAINER_NAME}" /bin/zsh; then
        error "Interactive session failed"
        exit 1
    fi

    # Step 4: Commit the configured container
    echo ""
    log "Committing configured container to new image..."

    # Get current timestamp for tag
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    NEW_TAG="${IMAGE_NAME}:${TIMESTAMP}"
    LATEST_TAG="${IMAGE_NAME}:latest"

    if ! docker commit "${TEMP_CONTAINER_NAME}" "${NEW_TAG}"; then
        error "Failed to commit container"
        exit 1
    fi

    # Tag as latest
    if ! docker tag "${NEW_TAG}" "${LATEST_TAG}"; then
        error "Failed to tag as latest"
        exit 1
    fi

    success "Container committed as: ${NEW_TAG}"
    success "Tagged as latest: ${LATEST_TAG}"

    # Step 5: Push the images
    log "Pushing images to registry..."

    if ! docker push "${NEW_TAG}"; then
        error "Failed to push timestamped image"
        exit 1
    fi

    if ! docker push "${LATEST_TAG}"; then
        error "Failed to push latest image"
        exit 1
    fi

    success "Images pushed successfully:"
    success "  - ${NEW_TAG}"
    success "  - ${LATEST_TAG}"

    # Clean up (handled by trap)
    log "Build process completed successfully!"
    echo ""
    log "You can now use the new image with:"
    log "  docker compose -f docker/docker-compose.run.yml up -d"
}

# Check if running with bash
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
