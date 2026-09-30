#!/usr/bin/env bash
# Exercise system-pkg-remove.sh, system-update.sh and system-capture.sh through their
# CLIs with stubbed pacman/yay/sudo/fzf/tesseract/etc.
set -Eeuo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
SYS="$ROOT/scripts/system"
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

fail() {
    echo "FAIL: $*" >&2
    exit 1
}

stub() {
    local dir=$1 name=$2
    mkdir -p "$dir"
    cat > "$dir/$name"
    chmod +x "$dir/$name"
}

# Every stub appends "name args..." to $CALLS so tests can assert on what ran.
CALLS="$TMP_DIR/calls"
export CALLS
record() { echo 'echo "$(basename "$0") $*" >> "$CALLS"'; }

BIN="$TMP_DIR/bin"
for name in sudo systemd-inhibit notify-send wl-copy; do
    stub "$BIN" "$name" <<STUB
#!/usr/bin/env bash
$(record)
[[ \$(basename "\$0") == systemd-inhibit ]] && { shift 3; exec "\$@"; }
[[ \$(basename "\$0") == wl-copy ]] && cat >> "$TMP_DIR/clipboard"
exit 0
STUB
done
stub "$BIN" pacman <<'STUB'
#!/usr/bin/env bash
echo "pacman $*" >> "$CALLS"
case $1 in
    -Qqe) printf '%s\n' htop neovim ;;
    -Qdtq) printf '%s\n' orphan-a orphan-b ;;
esac
STUB
stub "$BIN" yay <<'STUB'
#!/usr/bin/env bash
echo "yay $*" >> "$CALLS"
STUB
# fzf "selects" the first and last candidate, or cancels when STUB_CANCEL is set.
stub "$BIN" fzf <<'STUB'
#!/usr/bin/env bash
cat > "$TMP_LIST"
[[ -n ${STUB_CANCEL:-} ]] && exit 130
sed -n '1p;$p' "$TMP_LIST"
STUB
export TMP_LIST="$TMP_DIR/fzf-candidates"
export PATH="$BIN:$PATH"

reset_calls() { : > "$CALLS"; rm -f "$TMP_DIR/clipboard"; }
calls_have() { grep -Fxq -- "$1" "$CALLS" || fail "expected call '$1', got: $(cat "$CALLS")"; }
calls_lack() { ! grep -q -- "$1" "$CALLS" || fail "unexpected call matching '$1': $(cat "$CALLS")"; }

# --- system-pkg-remove.sh ---------------------------------------------------
reset_calls
"$SYS/system-pkg-remove.sh" <<<"" >/dev/null
[[ $(cat "$TMP_LIST") == $'htop\nneovim' ]] || fail "remove: unexpected candidates: $(cat "$TMP_LIST")"
calls_have "sudo pacman -Rns htop neovim"

reset_calls
STUB_CANCEL=1 "$SYS/system-pkg-remove.sh" <<<"" >/dev/null
calls_lack "pacman -Rns"

# --- system-update.sh -------------------------------------------------------
reset_calls
# Answer "y" to the orphan prompt, then enter to close.
"$SYS/system-update.sh" packages <<<$'y\n\n' >/dev/null
calls_have "yay -Syu"
calls_have "sudo pacman -Rns orphan-a orphan-b"

reset_calls
"$SYS/system-update.sh" packages <<<$'n\n\n' >/dev/null
calls_lack "pacman -Rns"

# Reboot notice appears only when the running kernel's modules are gone.
stub "$BIN" uname <<'STUB'
#!/usr/bin/env bash
echo 0.0.0-does-not-exist
STUB
out=$("$SYS/system-update.sh" packages <<<$'n\n\n')
grep -q "Reboot" <<<"$out" || fail "update: missing reboot notice"
rm "$BIN/uname"
out=$("$SYS/system-update.sh" packages <<<$'n\n\n')
! grep -q "Reboot" <<<"$out" || fail "update: false reboot notice"

if "$SYS/system-update.sh" bogus 2>/dev/null; then fail "update: bogus mode accepted"; fi

# --- system-capture.sh ------------------------------------------------------
CAP_BIN="$TMP_DIR/capbin"
stub "$CAP_BIN" slurp <<'STUB'
#!/usr/bin/env bash
echo "10,20 300x40"
STUB
stub "$CAP_BIN" grim <<'STUB'
#!/usr/bin/env bash
echo "grim $*" >> "$CALLS"
echo fakepng
STUB
stub "$CAP_BIN" tesseract <<'STUB'
#!/usr/bin/env bash
echo "tesseract $*" >> "$CALLS"
cat > /dev/null
printf '%s' "${STUB_OCR_TEXT-hello world}"
STUB
stub "$CAP_BIN" hyprpicker <<'STUB'
#!/usr/bin/env bash
echo "hyprpicker $*" >> "$CALLS"
echo "#a1b2c3"
STUB

# Without tesseract or hyprpicker installed, capture notifies instead of failing silently.
reset_calls
PATH="$BIN:$PATH" "$SYS/system-capture.sh" text && fail "capture text: should fail without tesseract"
grep -q "notify-send.*Missing tesseract" "$CALLS" || fail "capture text: no missing-tool notification"

export PATH="$CAP_BIN:$PATH"

reset_calls
"$SYS/system-capture.sh" text
[[ $(cat "$TMP_DIR/clipboard") == "hello world" ]] || fail "capture text: clipboard was '$(cat "$TMP_DIR/clipboard" 2>/dev/null)'"
calls_have "grim -g 10,20 300x40 -"
grep -q "tesseract.*-l eng" "$CALLS" || fail "capture text: default language not eng"

reset_calls
LEO_OCR_LANGS=eng+deu "$SYS/system-capture.sh" text
grep -q "tesseract.*-l eng+deu" "$CALLS" || fail "capture text: LEO_OCR_LANGS ignored"

reset_calls
STUB_OCR_TEXT="   " "$SYS/system-capture.sh" text && fail "capture text: blank OCR should fail"
[[ ! -s "$TMP_DIR/clipboard" ]] || fail "capture text: blank OCR overwrote the clipboard"
grep -q "No text found" "$CALLS" || fail "capture text: no 'No text found' notification"

reset_calls
"$SYS/system-capture.sh" color
[[ $(cat "$TMP_DIR/clipboard") == "#a1b2c3" ]] || fail "capture color: clipboard was '$(cat "$TMP_DIR/clipboard" 2>/dev/null)'"
calls_have "hyprpicker --format=hex"

if "$SYS/system-capture.sh" bogus 2>/dev/null; then fail "capture: bogus mode accepted"; fi

echo "PASS: system menu tools"
