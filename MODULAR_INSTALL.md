# Modular Installation System

The install.sh script has been refactored into modular components for better maintainability and Docker compatibility.

## Structure

```
lib/
├── common.sh        # Shared variables and utilities
├── symlinks.sh      # Symbolic link management
├── packages.sh      # OS-specific package installation
├── software.sh      # Individual software installations
├── keys.sh          # SSH/GPG key management
└── environment.sh   # Environment-specific setup (WSL, work)

scripts/
├── docker-setup-symlinks.sh  # Docker: setup symlinks only
├── docker-install-packages.sh # Docker: install packages only
└── docker-install.sh          # Docker: complete installation
```

## Usage

### Full Installation
```bash
./install.sh                    # Complete installation
./install.sh --work             # Work environment
./install.sh --test             # Test mode (dry run)
./install.sh --linkonly         # Symlinks only
```

### Docker Usage
```bash
# In Dockerfile
COPY . /dotfiles
RUN /dotfiles/scripts/docker-install.sh

# Or just symlinks
RUN /dotfiles/scripts/docker-setup-symlinks.sh

# Or just packages  
RUN /dotfiles/scripts/docker-install-packages.sh
```

### Individual Modules
Each module can be run independently:
```bash
./lib/symlinks.sh              # Setup symlinks
./lib/packages.sh              # Install packages
./lib/software.sh              # Install software
./lib/keys.sh                  # Install keys
./lib/environment.sh           # Environment setup
```

## Benefits

- **Modular**: Each component can be used independently
- **Docker-friendly**: Separate scripts for container environments
- **Maintainable**: Easier to modify individual components
- **Reusable**: Components can be used in different contexts
- **Testable**: Each module can be tested separately