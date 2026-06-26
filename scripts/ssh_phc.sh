#!/bin/env bash
set -euo pipefail

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
SSH_HOSTS_FILE="$SCRIPT_DIR/ssh_phc_hosts.conf"
DOMAIN="corp.ads"
USER="13lbise"
OPTS=(-X -A -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o TCPKeepAlive=yes)

INDEX_LIST=()
COMMENT_LIST=()

function print_help {
    cat <<EOF
Usage: $0 [OPTION] [INDEX|MACHINE] [ARGS...]

  If INDEX/MACHINE is omitted, an fzf picker is shown.

  INDEX:             Index to the machine you want to connect
  MACHINE:           Machine name from the SSH host pool, or any host/address

  OPTION:
      -a/--addr HOST       Specify machine address to connect
      -l/--list            List known machines
      -u/--user USER       User to use
      -c/--copy            SSH copy key to remote host before connection
      -f/--fzf             Force fzf picker, even if an argument is provided
      --add [HOST] [DESC]  Add a new machine to the SSH host pool and exit
      --save [DESC]        Save the selected/direct host to the pool before connecting
      -h/--help            Show this help

  ARGS:              Further arguments passed to ssh

Machine pool:
  $SSH_HOSTS_FILE

Examples:
  $0                         # pick from fzf
  $0 3                       # connect to index 3
  $0 ch03wxpevb12            # connect by machine name
  $0 --add ch03newbox "PEVB #16 Alice"
  $0 --addr ch03newbox --save "temporary lab box"
EOF
}

function trim {
    local value="$1"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    printf '%s' "$value"
}

function load_machines {
    touch "$SSH_HOSTS_FILE"

    local line no_comment comment keyword host
    while IFS= read -r line || [[ -n "$line" ]]; do
        [[ "$line" =~ ^[[:space:]]*Host[[:space:]]+ ]] || continue

        comment=""
        if [[ "$line" == *#* ]]; then
            comment=$(trim "${line#*#}")
        fi
        no_comment="${line%%#*}"

        read -ra parts <<< "$no_comment"
        keyword="${parts[0]:-}"
        [[ "$keyword" == "Host" ]] || continue

        for host in "${parts[@]:1}"; do
            # Ignore wildcard/negated Host patterns such as Host * or Host ch03*.
            [[ "$host" == *'*'* || "$host" == *'?'* || "$host" == '!'* ]] && continue
            INDEX_LIST+=("$host")
            COMMENT_LIST+=("$comment")
        done
    done < "$SSH_HOSTS_FILE"
}

function machine_exists {
    local machine="$1"
    local existing
    for existing in "${INDEX_LIST[@]}"; do
        [[ "$existing" == "$machine" ]] && return 0
    done
    return 1
}

function add_machine {
    local machine="$1"
    local comment="${2:-}"
    local entry tmp

    if [[ -z "$machine" ]]; then
        read -rp "Machine name: " machine
    fi
    if [[ -z "$comment" ]]; then
        read -rp "Comment/description: " comment
    fi

    # Store short names in the pool; the domain is added by ssh config / this script.
    machine="${machine%.$DOMAIN}"

    if [[ "$machine" =~ [[:space:]] ]]; then
        echo "Machine names cannot contain whitespace: $machine" >&2
        return 1
    fi

    if machine_exists "$machine"; then
        echo "$machine is already in $SSH_HOSTS_FILE"
        return 0
    fi

    entry="Host $machine"
    [[ -n "$comment" ]] && entry="$entry # $comment"

    tmp=$(mktemp)
    awk -v entry="$entry" '
        /^# Defaults for PHC/ && !inserted { print entry; inserted=1 }
        { print }
        END { if (!inserted) print entry }
    ' "$SSH_HOSTS_FILE" > "$tmp"
    mv "$tmp" "$SSH_HOSTS_FILE"

    INDEX_LIST+=("$machine")
    COMMENT_LIST+=("$comment")
    echo "Added $machine to $SSH_HOSTS_FILE"
}

function print_list {
    local cnt=0
    local i
    for i in "${INDEX_LIST[@]}"; do
        echo "#$cnt $i: ${COMMENT_LIST[$cnt]}"
        cnt=$((cnt+1))
    done
}

function pick_machine_fzf {
    if ! command -v fzf >/dev/null 2>&1; then
        echo "fzf is not installed; pass an index/machine or use --list." >&2
        return 1
    fi

    local cnt=0
    local selected
    local fzf_opts=(--delimiter='\t' --with-nth=1,2,3 --prompt='ssh> ' --reverse)

    if [[ -n "${TMUX:-}" ]]; then
        fzf_opts+=(--tmux=80%,40%)
    else
        fzf_opts+=(--height=40%)
    fi

    selected=$(for machine in "${INDEX_LIST[@]}"; do
        printf '%s\t%s\t%s\n' "$cnt" "$machine" "${COMMENT_LIST[$cnt]}"
        cnt=$((cnt+1))
    done | fzf "${fzf_opts[@]}")

    [[ -z "$selected" ]] && return 1
    printf '%s' "$selected" | cut -f2
}

function resolve_machine_arg {
    local arg="$1"

    if [[ "$arg" =~ ^[0-9]+$ ]]; then
        if [[ -z "${INDEX_LIST[$arg]:-}" ]]; then
            echo "Invalid index: $arg" >&2
            return 1
        fi
        printf '%s' "${INDEX_LIST[$arg]}"
        return 0
    fi

    # Exact pool-name match, otherwise treat the argument as a direct host.
    local machine
    for machine in "${INDEX_LIST[@]}"; do
        if [[ "$machine" == "$arg" ]]; then
            printf '%s' "$machine"
            return 0
        fi
    done

    printf '%s' "$arg"
}

function normalize_host {
    local host="$1"
    local configured_hostname=""

    # Keep FQDNs/IPs as-is.
    if [[ "$host" == *.* || "$host" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        printf '%s' "$host"
        return 0
    fi

    # If ssh config already expands this alias with HostName, pass the alias to ssh.
    # Otherwise a HostName like "%h.$DOMAIN" would see an already-expanded name and
    # turn ch03foo.$DOMAIN into ch03foo.$DOMAIN.$DOMAIN.
    configured_hostname=$(ssh -G "$host" 2>/dev/null | awk '$1 == "hostname" { print $2; exit }' || true)
    if [[ -n "$configured_hostname" && "$configured_hostname" != "$host" ]]; then
        printf '%s' "$host"
        return 0
    fi

    # Backwards-compatible fallback for short direct hosts that are not covered by
    # ssh config.
    printf '%s.%s' "$host" "$DOMAIN"
}

load_machines

POSITIONAL_ARGS=()
ADDRESS=""
COPY_KEY=0
LIST_INDEX=0
FORCE_FZF=0
ADD_ONLY=0
SAVE_MACHINE=0
SAVE_COMMENT=""
ADD_MACHINE=""
ADD_COMMENT=""

while [[ $# -gt 0 ]]; do
  case $1 in
    -a|--addr|--adr)
    shift
    ADDRESS="${1:-}"
    shift || true
    ;;
    -c|--copy)
    COPY_KEY=1
    shift
    ;;
    -l|--list)
    LIST_INDEX=1
    shift
    ;;
    -u|--user)
    shift
    USER="${1:-}"
    shift || true
    ;;
    -f|--fzf)
    FORCE_FZF=1
    shift
    ;;
    --add)
    ADD_ONLY=1
    shift
    ADD_MACHINE="${1:-}"
    [[ $# -gt 0 ]] && shift
    ADD_COMMENT="${1:-}"
    [[ $# -gt 0 ]] && shift
    ;;
    --save)
    SAVE_MACHINE=1
    shift
    if [[ $# -gt 0 && ! "$1" =~ ^- ]]; then
        SAVE_COMMENT="$1"
        shift
    fi
    ;;
    -h|--help)
    print_help
    exit 0
    ;;
    --)
    shift
    POSITIONAL_ARGS+=("$@")
    break
    ;;
    -*|--*)
    echo "Unknown option $1" >&2
    exit 1
    ;;
    *)
    # First positional argument is the machine/index; everything after it is passed to ssh.
    POSITIONAL_ARGS+=("$1")
    shift
    POSITIONAL_ARGS+=("$@")
    break
    ;;
  esac
done

if [[ "$ADD_ONLY" == 1 ]]; then
    add_machine "$ADD_MACHINE" "$ADD_COMMENT"
    exit 0
fi

if [[ "$LIST_INDEX" == 1 ]]; then
    print_list
    exit 0
fi

MACHINE=""
if [[ -n "$ADDRESS" ]]; then
    MACHINE="$ADDRESS"
elif [[ "$FORCE_FZF" == 1 || ${#POSITIONAL_ARGS[@]} -eq 0 ]]; then
    MACHINE=$(pick_machine_fzf)
else
    MACHINE=$(resolve_machine_arg "${POSITIONAL_ARGS[0]}")
    POSITIONAL_ARGS=("${POSITIONAL_ARGS[@]:1}")
fi

if [[ -z "$MACHINE" ]]; then
    echo "No machine selected." >&2
    exit 1
fi

if [[ "$SAVE_MACHINE" == 1 ]]; then
    add_machine "$MACHINE" "$SAVE_COMMENT"
fi

MACHINE=$(normalize_host "$MACHINE")

if [[ "$COPY_KEY" == 1 ]]; then
    echo "Copying key to $MACHINE"
    ssh-copy-id -f "$USER@$MACHINE"
    ssh-copy-id -f -i ~/.ssh/13lbisex2go_id_rsa "$USER@$MACHINE"
fi

echo "Connecting to $MACHINE with args ${OPTS[*]} ${POSITIONAL_ARGS[*]}"
ssh "${OPTS[@]}" "$USER@$MACHINE" "${POSITIONAL_ARGS[@]}"
