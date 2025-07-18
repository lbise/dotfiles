# leo's development container

FROM ubuntu:24.04

# ---------- Base image preparation -----------------------------------------
ENV \
    UID="1000" \
    GID="1000" \
    UNAME="leodev" \
    SHELL="/bin/zsh" \
    TZ=UTC \
    LANG=en_US.UTF-8 \
    LANGUAGE=en_US:en \
    LC_ALL=en_US.UTF-8

RUN useradd -m -s "${SHELL}" "${UNAME}" \
    && echo "${UNAME} ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

RUN apt-get update && apt-get install -y --no-install-recommends \
    zsh curl wget git unzip gnupg ca-certificates \
    build-essential cmake pkg-config \
    python3 python3-pip python3-venv pipx \
    ripgrep fd-find fzf npm \
    xz-utils \
  && rm -rf /var/lib/apt/lists/*

# ---------- Opencode ----------------------------------------------
RUN npm install -g opencode-ai

# ---------- nodejs ----------------------------------------------
RUN set -eux; \
    NODE_VERSION="20.13.1"; \
    wget -q "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" -O /tmp/node.tar.xz; \
    mkdir -p /usr/local/lib/nodejs; \
    tar -xJf /tmp/node.tar.xz -C /usr/local/lib/nodejs --strip-components=1; \
    rm /tmp/node.tar.xz; \
    ln -s /usr/local/lib/nodejs/bin/node /usr/local/bin/node; \
    ln -s /usr/local/lib/nodejs/bin/npm /usr/local/bin/npm; \
    ln -s /usr/local/lib/nodejs/bin/npx /usr/local/bin/npx

# ---------- Switch to user! ---------------------------------------
USER ${UNAME}
WORKDIR /home/${UNAME}

# ---------- Neovim ---------------------------------------
ENV NVIM_VERSION="0.11.2"

# Copy Neovim tarball from repo into image and install
ENV NVIM_DST="/home/${UNAME}/.bin"
RUN mkdir -p ${NVIM_DST}
COPY archives/nvim-${NVIM_VERSION}-linux-x86_64.tar.gz /home/${UNAME}/nvim.tar.gz
RUN tar -xf /home/${UNAME}/nvim.tar.gz -C ${NVIM_DST} \
    && rm /home/${UNAME}/nvim.tar.gz

# Add Neovim to PATH
ENV PATH="${NVIM_DST}/nvim-linux-x86_64/bin:${PATH}"

# ---------- Oh My Zsh ----------------------------------------------
RUN sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"

# ---------- Symlinks ---------------------
ENV XDG_CONFIG_HOME="/home/${UNAME}/.config"
RUN set -eu; \
    ln -sf /home/${UNAME}/gitrepo/leo_dotfiles/.zshrc /home/${UNAME}/.zshrc; \
    mkdir -p ${XDG_CONFIG_HOME}/opencode; \
    ln -sf /home/${UNAME}/gitrepo/leo_dotfiles/opencode.json ${XDG_CONFIG_HOME}/opencode/opencode.json; \
    ln -sf /home/${UNAME}/gitrepo/leo_dotfiles/nvim ${XDG_CONFIG_HOME}/nvim

#---------- Install Neovim plugins ---------------------
# Temp copy of dotfiles so plugins can be installed
COPY --chown=${UNAME}:${UNAME} ./nvim /home/${UNAME}/gitrepo/leo_dotfiles/nvim
RUN mkdir -p /home/${UNAME}/.local/share/nvim
RUN ls /home/${UNAME}/gitrepo/leo_dotfiles

# First ensure the plugin manager is bootstrapped, then sync plugins
RUN nvim --headless "+Lazy! sync" +qa

# Install Mason tools after plugins are available
RUN nvim --headless "+MasonInstall clangd clang-format pyright ruff@0.11.2 bash-language-server lua-language-server stylua" +qa

RUN rm -rf /home/${UNAME}/gitrepo/leo_dotfiles
