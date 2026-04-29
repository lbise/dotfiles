#!/usr/bin/env bash
set -Eeuo pipefail

REMOTE_USER="${USER:-${LOGNAME:-}}"
REMOTE_USER_SET=0
PORT=""
DRY_RUN=0
TARGET=""
declare -a REQUESTED_KEYS=()
declare -a KEYS=()

error() {
    echo "ERROR: $*" >&2
    exit 1
}

info() {
    echo ">> $*"
}

usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS] HOST|USER@HOST

Copy one or more local SSH public keys to the remote machine's ~/.ssh directory.
This is useful when the remote machine needs a copy of your public key file,
for example for SSH-based Git commit signing.

If no --key option is provided, all public keys in ~/.ssh/*.pub are copied.
Only public keys are supported by this script.

Options:
  -u, --user USER      Remote user to use
  -p, --port PORT      Remote SSH port
  -i, --key PATH       Public key to copy (can be used multiple times)
  -n, --dry-run        Show what would be copied without changing anything
  -h, --help           Show this help

Examples:
  $(basename "$0") server.example.com
  $(basename "$0") leo@server.example.com
  $(basename "$0") --user leo --port 2222 192.168.1.20
  $(basename "$0") --key ~/.ssh/id_ed25519.pub host
EOF
}

require_command() {
    command -v "$1" >/dev/null 2>&1 || error "Missing required command: $1"
}

expand_path() {
    local path="$1"

    if [[ "$path" == "~/"* ]]; then
        printf '%s/%s\n' "$HOME" "${path#~/}"
    else
        printf '%s\n' "$path"
    fi
}

looks_like_public_key() {
    local key_file="$1"
    local first_field

    read -r first_field _ < "$key_file" || return 1

    case "$first_field" in
        ssh-rsa|ssh-ed25519|ssh-dss|ecdsa-sha2-nistp256|ecdsa-sha2-nistp384|ecdsa-sha2-nistp521|sk-ecdsa-sha2-nistp256@openssh.com|sk-ssh-ed25519@openssh.com)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

list_default_keys() {
    local ssh_dir="$HOME/.ssh"
    local default_keys=()

    shopt -s nullglob
    default_keys=("$ssh_dir"/*.pub)
    shopt -u nullglob

    (( ${#default_keys[@]} > 0 )) || error "No public keys found in $ssh_dir"

    printf '%s\n' "${default_keys[@]}"
}

run_ssh() {
    if [[ -n "$PORT" ]]; then
        ssh -p "$PORT" "$SSH_TARGET" "$@"
    else
        ssh "$SSH_TARGET" "$@"
    fi
}

copy_with_scp() {
    local key_file="$1"
    local remote_path="$2"

    if [[ -n "$PORT" ]]; then
        scp -P "$PORT" "$key_file" "$SSH_TARGET:$remote_path"
    else
        scp "$key_file" "$SSH_TARGET:$remote_path"
    fi
}

copy_with_ssh_stream() {
    local key_file="$1"
    local remote_path="$2"

    if [[ -n "$PORT" ]]; then
        ssh -p "$PORT" "$SSH_TARGET" \
            "cat > \"\$HOME/$remote_path\" && chmod 600 \"\$HOME/$remote_path\"" \
            < "$key_file"
    else
        ssh "$SSH_TARGET" \
            "cat > \"\$HOME/$remote_path\" && chmod 600 \"\$HOME/$remote_path\"" \
            < "$key_file"
    fi
}

ensure_remote_ssh_dir() {
    info "Ensuring remote ~/.ssh exists"
    run_ssh 'umask 077; mkdir -p ~/.ssh; chmod 700 ~/.ssh'
}

copy_key_to_remote_ssh_dir() {
    local key_file="$1"
    local remote_name remote_path

    remote_name="$(basename "$key_file")"
    remote_path=".ssh/$remote_name"

    info "Copying $(basename "$key_file") to $SSH_TARGET:~/$remote_path"

    if command -v scp >/dev/null 2>&1; then
        copy_with_scp "$key_file" "$remote_path"
        run_ssh "chmod 600 \"\$HOME/$remote_path\""
    else
        copy_with_ssh_stream "$key_file" "$remote_path"
    fi
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        -u|--user)
            [[ $# -ge 2 ]] || error "Missing value for $1"
            REMOTE_USER="$2"
            REMOTE_USER_SET=1
            shift 2
            ;;
        -p|--port)
            [[ $# -ge 2 ]] || error "Missing value for $1"
            PORT="$2"
            shift 2
            ;;
        -i|--key)
            [[ $# -ge 2 ]] || error "Missing value for $1"
            REQUESTED_KEYS+=("$2")
            shift 2
            ;;
        -n|--dry-run)
            DRY_RUN=1
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        --)
            shift
            break
            ;;
        -*)
            error "Unknown option: $1"
            ;;
        *)
            if [[ -n "$TARGET" ]]; then
                error "Only one target can be provided"
            fi
            TARGET="$1"
            shift
            ;;
    esac
done

if [[ -z "$TARGET" && $# -gt 0 ]]; then
    TARGET="$1"
    shift
fi

if [[ $# -gt 0 ]]; then
    error "Unexpected arguments: $*"
fi

[[ -n "$TARGET" ]] || {
    usage
    exit 1
}

require_command ssh

if [[ -n "$PORT" && ! "$PORT" =~ ^[0-9]+$ ]]; then
    error "Port must be a number: $PORT"
fi

if [[ "$TARGET" == *@* ]]; then
    SSH_TARGET="$TARGET"
    if [[ $REMOTE_USER_SET -eq 1 ]]; then
        info "Ignoring --user because target already includes a user"
    fi
else
    [[ -n "$REMOTE_USER" ]] || error "Could not determine remote user, please pass --user"
    SSH_TARGET="${REMOTE_USER}@${TARGET}"
fi

if (( ${#REQUESTED_KEYS[@]} > 0 )); then
    for key in "${REQUESTED_KEYS[@]}"; do
        KEYS+=("$(expand_path "$key")")
    done
else
    while IFS= read -r key; do
        KEYS+=("$key")
    done < <(list_default_keys)
fi

(( ${#KEYS[@]} > 0 )) || error "No keys to copy"

for key in "${KEYS[@]}"; do
    [[ -f "$key" ]] || error "Key file not found: $key"
    looks_like_public_key "$key" || error "Refusing to copy a non-public key file: $key"
done

info "Target: $SSH_TARGET"
if [[ -n "$PORT" ]]; then
    info "Port: $PORT"
fi
info "Remote directory: ~/.ssh"
info "Keys to copy:"
for key in "${KEYS[@]}"; do
    echo "   - $key"
done

if [[ $DRY_RUN -eq 1 ]]; then
    info "Dry run complete"
    exit 0
fi

ensure_remote_ssh_dir

for key in "${KEYS[@]}"; do
    copy_key_to_remote_ssh_dir "$key"
done

info "Done"
