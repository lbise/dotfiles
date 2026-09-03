# Refresh connection-specific display variables in persistent Herdr panes.

herdr_sync_display_environment() {
    [[ -n "${HERDR_ENV:-}" && -n "${HERDR_SOCKET_PATH:-}" ]] || return

    local environment_file="${HERDR_SOCKET_PATH%/*}/client-environment.sh"
    [[ -r "$environment_file" ]] || return

    local environment
    environment=$(<"$environment_file")
    [[ -n "$environment" && "$environment" != "${__HERDR_DISPLAY_ENVIRONMENT:-}" ]] || return

    __HERDR_DISPLAY_ENVIRONMENT=$environment
    eval "$environment"
}

if [[ $- == *i* ]]; then
    if [[ -n "${ZSH_VERSION:-}" ]]; then
        autoload -Uz add-zsh-hook
        add-zsh-hook precmd herdr_sync_display_environment
        add-zsh-hook preexec herdr_sync_display_environment
    elif [[ -n "${BASH_VERSION:-}" ]]; then
        PROMPT_COMMAND="herdr_sync_display_environment${PROMPT_COMMAND:+; $PROMPT_COMMAND}"
    fi
fi
