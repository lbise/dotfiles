#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
usage_dir="${XDG_STATE_HOME:-$HOME/.local/state}/leo/ai-usage"
mkdir -p "$usage_dir"

flags=()
only=()
declare -A excluded=()

while (($# > 0)); do
  case "$1" in
    --force|--limits-only)
      flags+=("$1")
      ;;
    --except)
      [[ $# -ge 2 ]] || { echo "--except needs a provider name" >&2; exit 2; }
      excluded["$2"]=1
      shift
      ;;
    *)
      only+=("$1")
      ;;
  esac
  shift
done

wanted() {
  local provider="$1"
  [[ -z ${excluded[$provider]:-} ]] || return 1
  if ((${#only[@]} == 0)); then return 0; fi
  local candidate
  for candidate in "${only[@]}"; do
    [[ "$candidate" == "$provider" ]] && return 0
  done
  return 1
}

collect() {
  local collector="$1" provider="$2" record tmp
  if ! record=$("$collector" "${flags[@]}") || [[ -z "$record" ]] || ! jq -e . >/dev/null 2>&1 <<<"$record"; then
    echo "ai-usage-update: $provider collector failed" >&2
    return 1
  fi

  tmp=$(mktemp "$usage_dir/.$provider.XXXXXX")
  printf '%s\n' "$record" >"$tmp"
  mv "$tmp" "$usage_dir/$provider.json"
}

pids=()
for collector in "$SCRIPT_DIR"/ai-usage-*.py; do
  [[ -x "$collector" ]] || continue
  provider=$(basename "$collector" .py)
  provider=${provider#ai-usage-}
  wanted "$provider" || continue
  collect "$collector" "$provider" &
  pids+=("$!")
done

status=0
for pid in "${pids[@]}"; do
  wait "$pid" || status=1
done
exit "$status"
