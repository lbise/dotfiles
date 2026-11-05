# Refresh connection-specific environment in persistent Herdr panes.

herdr_sync_connection_environment() {
    [[ -n "${HERDR_ENV:-}" ]] || return 0

    local socklink="$HOME/.scripts/herdr-socklink.sh" auth_sock
    if [[ -x "$socklink" ]] && auth_sock=$("$socklink" show 2>/dev/null) && [[ -S "$auth_sock" ]]; then
        export SSH_AUTH_SOCK="$auth_sock"
    fi

    local environment_dir="${HERDR_ENVIRONMENT_DIR:-$HOME/.config/herdr}"
    local environment_file="$environment_dir/client-environment.sh"
    [[ -r "$environment_file" && -O "$environment_file" ]] || return 0

    local environment
    environment=$(<"$environment_file")
    [[ -n "$environment" && "$environment" != "${__HERDR_DISPLAY_ENVIRONMENT:-}" ]] || return 0

    __HERDR_DISPLAY_ENVIRONMENT=$environment
    eval "$environment"
}

if [[ $- == *i* ]]; then
    herdr_sync_connection_environment
    if [[ -n "${ZSH_VERSION:-}" ]]; then
        autoload -Uz add-zsh-hook
        add-zsh-hook precmd herdr_sync_connection_environment
        add-zsh-hook preexec herdr_sync_connection_environment
    elif [[ -n "${BASH_VERSION:-}" ]]; then
        PROMPT_COMMAND="herdr_sync_connection_environment${PROMPT_COMMAND:+; $PROMPT_COMMAND}"
    fi
fi
