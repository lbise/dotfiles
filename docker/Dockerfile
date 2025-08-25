# leo's development container

FROM ubuntu:24.04

# ---------- Build arguments -----------------------------------------
ARG UID=949479682
ARG GID=3280
ARG AZURE_RESOURCE_NAME="AZURE_RESOURCE_NAME_UNSET"
ARG AZURE_API_KEY="AZURE_API_KEY_UNSET"

# ---------- Base image preparation -----------------------------------------
ENV \
    UID="${UID}" \
    GID="${GID}" \
    UNAME="leodev" \
    SHELL="/bin/zsh" \
    TZ=UTC \
    LANG=en_US.UTF-8 \
    LANGUAGE=en_US:en \
    LC_ALL=en_US.UTF-8

RUN groupadd -g "${GID}" "${UNAME}" \
    && useradd -m -u "${UID}" -g "${GID}" -s "${SHELL}" "${UNAME}" \
    && echo "${UNAME} ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

RUN apt-get update && apt-get install -y --no-install-recommends \
    zsh curl wget git unzip gnupg ca-certificates \
    build-essential cmake pkg-config \
    python3 python3-pip python3-venv pipx \
    ripgrep fd-find fzf npm \
    xz-utils \
    xclip \
  && rm -rf /var/lib/apt/lists/*

# Install fzf documentation files that Oh My Zsh requires
# Download fzf source to get the key-bindings.zsh file
RUN mkdir -p /tmp/fzf && \
    cd /tmp/fzf && \
    git clone --depth 1 https://github.com/junegunn/fzf.git . && \
    mkdir -p /usr/share/doc/fzf/examples && \
    cp shell/key-bindings.zsh /usr/share/doc/fzf/examples/ && \
    cd / && rm -rf /tmp/fzf

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

# ---------- Opencode ----------------------------------------------
# Run opencode so packages are retrieved and cached
# This is not perfect, as it seems not all dependencies are loaded this way
RUN mkdir -p /home/${UNAME}/.local/share/opencode
#COPY --chown=${UID}:${GID} auth.json /home/${UNAME}/.local/share/opencode
RUN opencode -m azure/o3 run "test"
#RUN opencode -m github-copilot/gpt-4.1 run "test"

# ---------- Neovim ---------------------------------------
ENV NVIM_VERSION="0.11.3"

ENV NVIM_DST="/home/${UNAME}/.bin"
RUN mkdir -p ${NVIM_DST}
RUN wget -q "https://github.com/neovim/neovim/releases/download/v${NVIM_VERSION}/nvim-linux-x86_64.tar.gz" -O /home/${UNAME}/nvim.tar.gz
RUN tar -xf /home/${UNAME}/nvim.tar.gz -C ${NVIM_DST} \
    && rm /home/${UNAME}/nvim.tar.gz

# Add Neovim to PATH
ENV PATH="${NVIM_DST}/nvim-linux-x86_64/bin:${PATH}"

# ---------- Oh My Zsh ----------------------------------------------
RUN sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"

# ---------- Setup dotfiles symlinks using YAML-driven system ---------------------
# Temp copy of dotfiles so the YAML system can be used
RUN mkdir -p /home/${UNAME}/gitrepo
RUN git clone "https://github.com/lbise/dotfiles.git" "gitrepo/leo_dotfiles"

# Use the new YAML-driven symlink setup with minimal profile (perfect for Docker)
RUN cd /home/${UNAME}/gitrepo/leo_dotfiles && \
    ./install-yaml.sh --profile minimal

#---------- Install Neovim plugins ---------------------
RUN mkdir -p /home/${UNAME}/.local/share/nvim

# First ensure the plugin manager is bootstrapped, then sync plugins
RUN nvim --headless "+Lazy! sync" +qa

# Install Mason tools after plugins are available
RUN nvim --headless "+MasonInstall clangd clang-format pyright ruff@0.11.2 bash-language-server lua-language-server stylua" +qa

# Clean up the temporary clone again
RUN rm -rf /home/${UNAME}/gitrepo/leo_dotfiles

RUN echo "Run dshell, opencode auth login and login to get depencencies for github copilot"
