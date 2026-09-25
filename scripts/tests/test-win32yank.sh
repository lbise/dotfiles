#!/usr/bin/env bash
# Regression tests for the WSL win32yank installer.
set -Eeuo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
if [[ ! -f /proc/version ]] || ! grep -qi 'microsoft\|wsl' /proc/version; then
    echo "SKIP: win32yank installer tests require WSL"
    exit 0
fi

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
FAKE_BIN="$TMP_DIR/bin"
HOME_DIR="$TMP_DIR/home"
CURL_LOG="$TMP_DIR/curl.log"
mkdir -p "$FAKE_BIN" "$HOME_DIR"

fail() {
    echo "FAIL: $*" >&2
    exit 1
}

cat > "$FAKE_BIN/curl" <<'SCRIPT'
#!/usr/bin/env bash
set -Eeuo pipefail
url=""
output=""
while (($#)); do
    case "$1" in
        -o)
            output="$2"
            shift 2
            ;;
        http://*|https://*)
            url="$1"
            shift
            ;;
        *)
            shift
            ;;
    esac
done
printf '%s\n' "$url" >> "$CURL_LOG"
if [[ "$url" == *api.github.com* ]]; then
    printf '{"tag_name":"%s"}\n' "$LATEST_TAG"
else
    : > "$output"
fi
SCRIPT

cat > "$FAKE_BIN/unzip" <<'SCRIPT'
#!/usr/bin/env bash
set -Eeuo pipefail
destination=""
while (($#)); do
    if [[ "$1" == "-d" ]]; then
        destination="$2"
        shift 2
    else
        shift
    fi
done
cat > "$destination/win32yank.exe" <<'BINARY'
#!/usr/bin/env bash
if [[ "${1:-}" == "--version" ]]; then
    echo "Unknown flag: '--version'" >&2
    exit 1
fi
BINARY
chmod +x "$destination/win32yank.exe"
SCRIPT
chmod +x "$FAKE_BIN/curl" "$FAKE_BIN/unzip"

run_installer() {
    PATH="$FAKE_BIN:$PATH" \
        HOME="$HOME_DIR" \
        CURL_LOG="$CURL_LOG" \
        LATEST_TAG="$LATEST_TAG" \
        "$ROOT/install/apps/win32yank.sh"
}

LATEST_TAG=v0.1.1
first_output=$(run_installer)
grep -Fq 'win32yank installed successfully' <<< "$first_output" ||
    fail "the first run did not install win32yank"
[[ -x "$HOME_DIR/.local/bin/win32yank.exe" ]] ||
    fail "the first run did not create the executable"

second_output=$(run_installer)
grep -Fq 'win32yank is already up to date (0.1.1)' <<< "$second_output" ||
    fail "the second run did not recognize the installed release"
[[ $(grep -c '/releases/download/' "$CURL_LOG") == 1 ]] ||
    fail "the second run downloaded the release archive again"

LATEST_TAG=v0.1.2
third_output=$(run_installer)
grep -Fq 'win32yank 0.1.1 is installed, upgrading to 0.1.2...' <<< "$third_output" ||
    fail "a newer release was not recognized"
[[ $(grep -c '/releases/download/' "$CURL_LOG") == 2 ]] ||
    fail "the newer release was not downloaded exactly once"

printf 'PASS: win32yank installer\n'
