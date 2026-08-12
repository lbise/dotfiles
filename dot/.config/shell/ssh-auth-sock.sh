# Keep long-running multiplexer panes on a stable SSH agent socket path.
# socklink.sh handles tmux exactly; Herdr uses the same per-TTY socket map with
# a best-effort "most recently attached" link because Herdr has no client hook.

_socklink="$HOME/.scripts/socklink.sh"
_herdr_socklink="$HOME/.scripts/herdr-socklink.sh"

if [[ $- == *i* ]] && [[ -x "$_socklink" ]]; then
    if [[ -n "${HERDR_ENV:-}" ]] && [[ -x "$_herdr_socklink" ]]; then
        _herdr_auth_sock=$("$_herdr_socklink" show)
        if [[ ! -L "$_herdr_auth_sock" ]]; then
            "$_socklink" -c herdr-shell-init set-tty-link
            "$_herdr_socklink" set-current-tty
        fi
        export SSH_AUTH_SOCK="$_herdr_auth_sock"
    elif [[ -n "${TMUX:-}" ]]; then
        _tmux_auth_sock=$("$_socklink" show-server-link)
        if [[ ! -L "$_tmux_auth_sock" ]]; then
            "$_socklink" -c tmux-shell-init set-server-link
            "$_socklink" -c tmux-shell-init set-tmux-env
        fi
        export SSH_AUTH_SOCK="$_tmux_auth_sock"
    else
        # Record this login TTY's real forwarded socket before replacing it
        # with a stable link inside a multiplexer.
        "$_socklink" -c shell-init set-tty-link
    fi
fi

# Refresh Herdr's stable link immediately before starting or attaching a
# client. This also ensures a newly started Herdr server inherits the stable
# path rather than the ephemeral forwarded socket.
herdr() {
    if [[ -z "${HERDR_ENV:-}" && -x "$_socklink" && -x "$_herdr_socklink" ]]; then
        local herdr_auth_sock
        "$_socklink" -c herdr-client set-tty-link
        "$_herdr_socklink" set-current-tty
        herdr_auth_sock=$("$_herdr_socklink" show)
        SSH_AUTH_SOCK="$herdr_auth_sock" command herdr "$@"
    else
        command herdr "$@"
    fi
}
