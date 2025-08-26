#!/usr/bin/env bash
set -euo pipefail

IMAGE="ch03git.phonak.com/13lbise/devenv:latest"
CONTAINER="devenv"

echo "➡️  Pulling latest image: $IMAGE"
docker pull "$IMAGE"

# Get the current image ID of the running container (if any)
CURRENT_IMAGE_ID=$(docker ps -a --filter "name=^/${CONTAINER}$" --format "{{.Image}}" | xargs docker images -q || true)
NEW_IMAGE_ID=$(docker images -q "$IMAGE")

#if [ "$CURRENT_IMAGE_ID" = "$NEW_IMAGE_ID" ] && [ -n "$CURRENT_IMAGE_ID" ]; then
#    echo "✅ Container '$CONTAINER' already running the latest image ($CURRENT_IMAGE_ID)."
#    exit 0
#fi

# Stop and remove old container if exists
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    echo "🛑 Stopping old container '$CONTAINER'..."
    docker stop "$CONTAINER" || true
    docker rm "$CONTAINER" || true
fi

HTTP_PROXY="${http_proxy}"
HTTPS_PROXY="${https_proxy}"
NO_PROXY="${no_proxy}"

# Start new container
echo "🚀 Starting new container '$CONTAINER'..."
docker run -d \
  --name "$CONTAINER" \
  --workdir /home/leodev \
  --tty \
  --interactive \
  --network host \
  -e DISPLAY="$DISPLAY" \
  -e TERM=xterm-256color \
  -e COLORTERM=truecolor \
  -e http_proxy="$HTTP_PROXY" \
  -e https_proxy="$HTTPS_PROXY" \
  -e no_proxy="$NO_PROXY" \
  -e AZURE_API_KEY="$AZURE_API_KEY" \
  -e AZURE_RESOURCE_NAME="$AZURE_RESOURCE_NAME" \
  --user "$(id -u):$(id -g)" \
  -v /home/13lbise/gitrepo/leo_dotfiles:/home/leodev/gitrepo/leo_dotfiles:rw \
  -v /home/13lbise/andromeda:/home/leodev/andromeda:rw \
  "$IMAGE" \
  sleep infinity

echo "✅ Container '$CONTAINER' is now running with the latest image ($NEW_IMAGE_ID)."

