# Development Environment Docker Container

This Docker setup provides a comprehensive development environment with tools like Neovim, Python, Node.js, and more, all pre-configured for seamless use.

## Prerequisites

- **Docker Engine 20.10+**: Required to build and run containers. Install from [docker.com](https://www.docker.com/).
- **Docker Compose 2.0+**: Used for multi-container orchestration. Note: `docker-compose` (standalone tool, v1.x) vs. `docker compose` (integrated plugin in Docker CLI, v2.0+). This setup uses the modern `docker compose` (v2.0+), which is faster and integrated. If you have Docker Desktop, it's included; otherwise, ensure your Docker installation supports it.

## Building the Image

From the `docker/` directory:

```bash
docker compose build
```

This command:
- Builds the Docker image using the `Dockerfile`.
- Installs all tools, dependencies, and configurations.
- May take several minutes on first run.

For a full rebuild (ignoring cache):

```bash
docker compose build --no-cache
```

Use this if you've updated the `Dockerfile` or need fresh installs.

## Running the Image in the Background

Start the container in detached mode:

```bash
docker compose up -d dev
```

- Runs the container in the background.
- Mounts your dotfiles and workspace directories.
- Enables host networking for git/SSH access.

Check if it's running:

```bash
docker compose ps
```

## Accessing and Using the Background Container

### Running a Shell

From the host, execute a shell in the running container:

```bash
docker exec -it dot-dev zsh
```

Or using compose:

```bash
docker compose exec dev zsh
```

This opens an interactive shell (zsh) inside the container.

### Running Neovim

Edit files directly from the host:

```bash
docker exec -it dot-dev nvim /path/to/file
```

Or from inside the container (after accessing via shell):

```bash
nvim /path/to/file
```

Neovim is pre-configured with plugins and language servers.

### Running Opencode

Assuming Opencode is available in the container, run it similarly:

```bash
docker exec -it dot-dev opencode
```

Or from the container shell:

```bash
opencode
```

## What's Included

- **Base System**: Ubuntu 24.04 with zsh and Oh My Zsh.
- **Editor**: Neovim 0.11.2 with plugins and language servers.
- **Languages**: Python 3, Node.js 20.13.1.
- **Tools**: Build tools, search tools, git, language servers, Opencode AI.

## Directory Structure

- `/home/leodev/gitrepo/leo_dotfiles`: Mounted dotfiles repo.
- `/home/leodev/andromeda`: Mounted workspace.
- `/home/leodev/.config/nvim`: Neovim config.
- `/home/leodev/.cache`: Persistent cache.

## Stopping and Cleanup

Stop the container:

```bash
docker compose down
```

Remove everything:

```bash
docker compose down --rmi all
```

## Troubleshooting

- Check logs: `docker compose logs dev`
- Restart: `docker compose restart dev`
- Ensure prerequisites are met and directories exist.