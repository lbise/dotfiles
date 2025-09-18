# Installation System

This system provides a declarative approach to managing dotfiles installation using configuration files.

## 🎯 **Key Benefits**

- **Declarative**: Define what you want, not how to get it
- **Environment-aware**: Different configs for Docker, WSL, work, etc.
- **Profile-based**: Predefined installation profiles
- **Maintainable**: Easy to modify without touching scripts
- **Docker-friendly**: Optimized configs for containers

## 📁 **Configuration Structure**

```
config/
├── packages.yml      # Package definitions per OS
├── symlinks.yml      # Symbolic link mappings  
├── software.yml      # Individual software installations
└── environments.yml  # Environment-specific settings
```

## 🚀 **Usage**

### Basic Installation
```bash
./install.sh                    # Full developer setup
./install.sh --test             # Dry run
./install.sh --profile minimal  # Symlinks only
```

### Profiles
```bash
--profile minimal    # Symlinks only
--profile server     # Server environment (no GUI)
--profile developer  # Full development setup (default)
```

### Environment Flags
```bash
--work              # Work environment setup
--wslonly           # WSL-optimized installation
--copyvim           # Copy vim plugins offline
```

## 📝 **Configuration Examples**

### Adding New Packages
```yaml
# config/packages.yml
packages:
  ubuntu:
    additional:
      - your-new-package
      - another-tool
```

### Adding New Symlinks
```yaml
# config/symlinks.yml
symlinks:
  core:
    "your-config": ".your-config"
    "your-dir": ".config/your-app"
```

### Creating Custom Environment
```yaml
# config/environments.yml
environments:
  your_env:
    skip_software: true
    packages: ["common"]
    git_config: "work"
```

### Adding New Software
```yaml
# config/software.yml
software:
  your_tool:
    version: "1.0.0"
    archive_template: "tool-{version}-linux.tar.gz"
    install_path: "$HOME/.bin"
    check_path: "$HOME/.bin/tool"
```

## 🐳 **Docker Integration**

Perfect for Docker environments:

```dockerfile
# Dockerfile
COPY . /dotfiles
RUN /dotfiles/install.sh --profile minimal --wslonly
```

Or use environment-specific configs:
```bash
# Will automatically use docker environment settings
ENVIRONMENT=docker ./install.sh
```

## 🔧 **Advanced Features**

### Variable Substitution
The system supports variable substitution in configurations:
- `{version}` - Software version
- `{install_path}` - Installation path
- `$HOME`, `$USER` - Environment variables

### Conditional Installation
```yaml
software:
  git_credential_manager:
    conditions:
      - "not work_install"  # Only install if not work environment
```

### Version-Specific Packages
```yaml
packages:
  ubuntu:
    version_specific:
      "20.04": [ctags]
      "22.04": [universal-ctags]
      "24.04": [python3.12-venv]
```

## 🧪 **Testing**

```bash
# Test YAML parsing
./install.sh --test-yaml

# Test specific profiles
./install.sh --test --profile minimal
./install.sh --test --profile server

# Test environment detection
WORK_INSTALL=1 ./install.sh --test
```

## 🏗️ **Architecture**

- **lib/config.sh**: YAML parser (pure bash, no dependencies)
- **lib/*-yaml.sh**: YAML-driven implementation modules
- **install.sh**: Main entry point with profile support
- **config/*.yml**: Declarative configuration files

This system maintains backward compatibility while providing a modern, maintainable approach to dotfiles management.