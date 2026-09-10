#!/usr/bin/env bash
# Regression tests for shared installer behavior.
set -Eeuo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

fail() {
    echo "FAIL: $*" >&2
    exit 1
}

mkdir -p "$TMP_DIR/home/.local/bin" "$TMP_DIR/bin"
cat > "$TMP_DIR/home/.local/bin/eza" <<'SCRIPT'
#!/usr/bin/env bash
cat <<'EOF'
eza eza - A modern, maintained replacement for ls
v0.23.5 [+git]
EOF
SCRIPT
cat > "$TMP_DIR/bin/curl" <<'SCRIPT'
#!/usr/bin/env bash
echo "curl should not run for an up-to-date application" >&2
exit 99
SCRIPT
chmod +x "$TMP_DIR/home/.local/bin/eza" "$TMP_DIR/bin/curl"

# shellcheck disable=SC1091
source "$ROOT/install/helpers.sh"

output=""
if ! output=$(PATH="$TMP_DIR/bin:$PATH" HOME="$TMP_DIR/home" \
    install_github_release \
    eza \
    eza-community/eza \
    https://example.invalid/eza.tar.gz \
    v0.23.5); then
    fail "a multiline version response was not recognized"
fi

grep -Fq 'eza is already up to date (0.23.5)' <<< "$output" ||
    fail "the installed eza version was not reported as current"

echo "PASS: install helpers"
