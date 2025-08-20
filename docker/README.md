# Development Environment Docker Container

This Docker setup creates a comprehensive development environment container with all the tools and configurations needed for software development.

## What's Included

The development container includes:

- **Base System**: Ubuntu 24.04 with zsh and Oh My Zsh
- **Editor**: Neovim 0.11.2 with pre-installed plugins and language servers
- **Languages & Runtimes**:
  - Python 3 with pip and pipx
  - Node.js 20.13.1 with npm and npx
- **Development Tools**:
  - Build tools (build-essential, cmake, pkg-config)
  - Search tools (ripgrep, fd-find, fzf)
  - Git and version control tools
- **Language Servers**: clangd, pyright, ruff, bash-language-server, lua-language-server, stylua
- **AI Assistant**: Opencode AI

## Prerequisites

- Docker installed on your system
- Docker Compose (usually included with Docker Desktop)

## Building the Image

From the docker directory, run:

```bash
docker-compose build
```

This will:
1. Build the Docker image using the Dockerfile
2. Install all development tools and dependencies
3. Set up Neovim with plugins and language servers
4. Configure the development environment

### Rebuilding from Scratch

If you need to rebuild the image completely from scratch (ignoring all cached layers):

```bash
docker-compose build --no-cache
```

This is useful when:
- You've made significant changes to the Dockerfile
- You want to ensure all packages are updated to their latest versions
- You're experiencing build issues that might be related to cached layers
- You want to force a complete rebuild

Note: This will take longer than a regular build as it downloads and installs everything fresh.

## Running the Container

### Interactive Mode

To start an interactive shell in the container:

```bash
docker-compose run --rm dev
```

This will:
- Start the container with zsh as the default shell
- Mount your dotfiles repository at `/home/leodev/gitrepo/leo_dotfiles`
- Mount the `andromeda` directory at `/home/leodev/andromeda` (if it exists)
- Set up display forwarding for GUI applications
- Use host networking for convenient git/ssh access

### Background Mode

To run the container in the background:

```bash
docker-compose up -d dev
```

### Accessing the Running Container

If running in background, attach to it:

```bash
docker attach dot-dev
```

To detach without stopping: `Ctrl+P` then `Ctrl+Q`

## Directory Structure

Inside the container:
- `/home/leodev/gitrepo/leo_dotfiles` - Your dotfiles repository (mounted)
- `/home/leodev/andromeda` - Additional workspace directory (mounted)
- `/home/leodev/.config/nvim` - Neovim configuration (symlinked to dotfiles)
- `/home/leodev/.cache` - Persistent cache directory

## Usage Tips

1. **File Changes**: Any changes made to mounted directories persist on your host
2. **Package Installation**: Use `pipx` for Python tools, `npm -g` for Node.js tools
3. **Neovim**: All plugins and language servers are pre-installed and ready to use
4. **Git**: Host networking allows seamless git operations and SSH key usage
5. **GUI Applications**: Display forwarding is configured for tools that need GUI

## Stopping and Cleanup

Stop the container:
```bash
docker-compose down
```

Remove the container and image:
```bash
docker-compose down --rmi all
```

## Customization

To modify the development environment:
1. Edit the `Dockerfile` to add new tools or change versions
2. Modify `docker-compose.yml` to change mount points or environment variables
3. Update your dotfiles in the mounted repository to customize shell/editor config

## Troubleshooting

- **Permission Issues**: The container runs as user `leodev` with sudo access
- **Network Issues**: Host networking should resolve most connectivity problems
- **Display Issues**: Ensure your DISPLAY environment variable is set correctly
- **Volume Mounts**: Make sure the source directories exist on your host system