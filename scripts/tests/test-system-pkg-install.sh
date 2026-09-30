#!/usr/bin/env bash
# Exercise system-pkg-install.sh through its CLI with stubbed pacman/yay/fzf.
set -Eeuo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
SCRIPT="$ROOT/scripts/system/system-pkg-install.sh"
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

fail() {
    echo "FAIL: $*" >&2
    exit 1
}

mkdir -p "$TMP_DIR/bin"
cat > "$TMP_DIR/bin/pacman" <<'STUB'
#!/usr/bin/env bash
case $1 in
    -Sl) printf '%s\n' 'extra git 2.0-1 [installed]' 'extra htop 3.0-1' 'core zlib 1-1 [installed: 0.9-1]' ;;
    -Qqm) printf '%s\n' yay ;;
esac
STUB
cat > "$TMP_DIR/bin/yay" <<'STUB'
#!/usr/bin/env bash
case $1 in
    -Slqa) printf '%s\n' yay paru ;;
    -S) shift 2; printf '%s\n' "$@" > "$STUB_DIR/installed" ;;
esac
STUB
# fzf stub: record the candidate list, then "select" the first and last entries.
cat > "$TMP_DIR/bin/fzf" <<'STUB'
#!/usr/bin/env bash
cat > "$STUB_DIR/candidates"
[[ -n ${STUB_CANCEL:-} ]] && exit 130
sed -n '1p;$p' "$STUB_DIR/candidates"
STUB
chmod +x "$TMP_DIR"/bin/*
export PATH="$TMP_DIR/bin:$PATH" STUB_DIR="$TMP_DIR"

run() { "$SCRIPT" "$@" < <(echo) > /dev/null; }

# all: repo + AUR, installed packages hidden, selection passed to yay.
run all
[[ $(cat "$TMP_DIR/candidates") == $'extra/htop\naur/paru' ]] || fail "unexpected candidates: $(cat "$TMP_DIR/candidates")"
[[ $(cat "$TMP_DIR/installed") == $'extra/htop\naur/paru' ]] || fail "unexpected install args: $(cat "$TMP_DIR/installed")"

# aur: only AUR candidates.
run aur
[[ $(cat "$TMP_DIR/candidates") == 'aur/paru' ]] || fail "aur scope leaked repo packages"

# repo: only repo candidates.
run repo
[[ $(cat "$TMP_DIR/candidates") == 'extra/htop' ]] || fail "repo scope leaked AUR packages"

# cancel: nothing installed, exit 0.
rm "$TMP_DIR/installed"
STUB_CANCEL=1 run all
[[ ! -e "$TMP_DIR/installed" ]] || fail "cancelled selection still installed something"

# bad scope: usage error.
if "$SCRIPT" bogus 2>/dev/null; then fail "bogus scope accepted"; fi

echo "PASS: system-pkg-install"
