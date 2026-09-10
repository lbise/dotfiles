#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

# These installers compare installed versions with their upstream releases and
# do not intentionally change the login shell or run remote installer scripts.
DEFAULT_APPS=(
    delta
    eza
    fd
    fzf
    herdr
    nvim
    ripgrep
    tmux
)
ALL_APPS=("${DEFAULT_APPS[@]}" opencode zsh)

known_app() {
    local requested=$1 app
    for app in "${ALL_APPS[@]}"; do
        [[ "$requested" == "$app" ]] && return 0
    done
    return 1
}

main() {
    local app
    local apps=("${DEFAULT_APPS[@]}")
    if [[ $# -gt 0 ]]; then
        apps=("$@")
    fi

    for app in "${apps[@]}"; do
        if ! known_app "$app" || [[ ! -x "$SCRIPT_DIR/$app.sh" ]]; then
            echo "Unknown or non-executable app installer: $app" >&2
            exit 2
        fi
        echo "Running $app.sh..."
        "$SCRIPT_DIR/$app.sh"
    done
}

main "$@"
