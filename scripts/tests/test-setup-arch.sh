#!/usr/bin/env bash
# Exercise the file edits in install/setup_arch.sh against temporary copies.
set -Eeuo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

fail() {
    echo "FAIL: $*" >&2
    exit 1
}

# Fake sudo that runs the command as the current user.
mkdir -p "$TMP_DIR/bin"
cat > "$TMP_DIR/bin/sudo" <<'SCRIPT'
#!/usr/bin/env bash
exec "$@"
SCRIPT
chmod +x "$TMP_DIR/bin/sudo"

# Fake localectl that keeps the X11 keymap in a file and logs every change.
export LOCALECTL_STATE="$TMP_DIR/x11-keymap" LOCALECTL_LOG="$TMP_DIR/localectl.log"
cat > "$TMP_DIR/bin/localectl" <<'SCRIPT'
#!/usr/bin/env bash
case "$1" in
    status)
        echo "System Locale: LANG=en_US.UTF-8"
        if [[ -f "$LOCALECTL_STATE" ]]; then
            read -r layout model variant < "$LOCALECTL_STATE"
            echo "    X11 Layout: $layout"
            echo "     X11 Model: $model"
            echo "   X11 Variant: $variant"
        fi
        ;;
    set-x11-keymap)
        echo "$2 $3 $4" > "$LOCALECTL_STATE"
        echo "$*" >> "$LOCALECTL_LOG"
        ;;
esac
SCRIPT
chmod +x "$TMP_DIR/bin/localectl"
export PATH="$TMP_DIR/bin:$PATH"

export PACMAN_CONF="$TMP_DIR/pacman.conf"
export NM_WIFI_BACKEND_CONF="$TMP_DIR/NetworkManager/conf.d/wifi-backend.conf"
export IWD_MAIN_CONF="$TMP_DIR/iwd/main.conf"
export IWD_WAIT_DROPIN="$TMP_DIR/systemd/iwd.service.d/wait-for-wlan0.conf"
export ZRAM_CONF="$TMP_DIR/systemd/zram-generator.conf"
# shellcheck source=../../install/setup_arch.sh
source "$ROOT/install/setup_arch.sh"

# Pacman gets colour, parallel downloads and multilib; testing repos stay off.
test_configure_pacman() {
    cat > "$PACMAN_CONF" <<'EOF'
[options]
#Color
#ParallelDownloads = 5

#[multilib-testing]
#Include = /etc/pacman.d/mirrorlist

#[multilib]
#Include = /etc/pacman.d/mirrorlist
EOF
    configure_pacman >/dev/null

    grep -Fxq 'Color' "$PACMAN_CONF" || fail "Color not enabled"
    grep -Fxq 'ParallelDownloads = 5' "$PACMAN_CONF" || fail "ParallelDownloads not enabled"
    grep -Fxq '[multilib]' "$PACMAN_CONF" || fail "multilib not enabled"
    grep -Fxq '#[multilib-testing]' "$PACMAN_CONF" || fail "multilib-testing was enabled"
    [[ $(grep -c '^Include' "$PACMAN_CONF") == 1 ]] || fail "expected exactly one enabled Include"

    configure_pacman | grep -q 'already configured' || fail "second run rewrote pacman.conf"
}

# NetworkManager uses wpa_supplicant with power save off, written once, and the
# iwd config left by older versions of the script is removed.
test_configure_network() {
    mkdir -p "$(dirname "$NM_WIFI_BACKEND_CONF")" "$(dirname "$IWD_MAIN_CONF")" "$(dirname "$IWD_WAIT_DROPIN")"
    printf '[device]\nwifi.backend=iwd\n' > "$NM_WIFI_BACKEND_CONF"
    printf '[DriverQuirks]\nDefaultInterface=*\n' > "$IWD_MAIN_CONF"
    printf '[Unit]\n' > "$IWD_WAIT_DROPIN"
    configure_network >/dev/null 2>&1
    [[ $(<"$NM_WIFI_BACKEND_CONF") == $'[device]\nwifi.backend=wpa_supplicant\n\n[connection]\nwifi.powersave=2' ]] || fail "unexpected NetworkManager config"
    [[ ! -e "$IWD_MAIN_CONF" && ! -e "$IWD_WAIT_DROPIN" ]] || fail "iwd config not removed"
    [[ $(configure_network 2>/dev/null | grep -c 'already configured') == 1 ]] || fail "second run rewrote the network config"
}

# The X11 keymap SDDM's greeter uses matches Hyprland's, set once.
test_configure_keyboard() {
    configure_keyboard >/dev/null
    [[ $(<"$LOCALECTL_STATE") == "ch pc105 fr" ]] || fail "unexpected X11 keymap: $(<"$LOCALECTL_STATE")"

    configure_keyboard | grep -q 'already configured' || fail "second run did not detect the keymap"
    [[ $(wc -l < "$LOCALECTL_LOG") == 1 ]] || fail "second run changed the keymap again"
}

# zram swap sized at half of RAM, written once.
test_configure_zram() {
    configure_zram >/dev/null
    [[ $(<"$ZRAM_CONF") == $'[zram0]\nzram-size = ram / 2\ncompression-algorithm = zstd' ]] || fail "unexpected zram config"
    configure_zram | grep -q 'already configured' || fail "second run rewrote the zram config"
}

test_configure_pacman
test_configure_network
test_configure_zram
test_configure_keyboard

echo "PASS: setup_arch"
