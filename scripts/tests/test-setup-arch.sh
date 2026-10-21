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
# shellcheck source=../../install/setup_arch.sh
source "$ROOT/install/setup_arch.sh"

# Pretend to be a desktop or a laptop regardless of the machine running the test.
FAKE_LAPTOP=0
is_laptop() {
    (( FAKE_LAPTOP ))
}

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

# NetworkManager uses iwd for Wi-Fi, and iwd keeps the kernel's interface, written once.
# A desktop gets no wlan0 wait, so iwd doesn't stall at boot without a Wi-Fi card.
test_configure_network() {
    FAKE_LAPTOP=0
    mkdir -p "$(dirname "$IWD_MAIN_CONF")"
    printf '[General]\nEnableNetworkConfiguration=true\n' > "$IWD_MAIN_CONF"
    configure_network >/dev/null 2>&1
    [[ $(<"$NM_WIFI_BACKEND_CONF") == $'[device]\nwifi.backend=iwd\nwifi.iwd.autoconnect=false' ]] || fail "unexpected NetworkManager config"
    [[ $(<"$IWD_MAIN_CONF") == $'[DriverQuirks]\nDefaultInterface=*' ]] || fail "unexpected iwd config"
    [[ $(configure_network 2>/dev/null | grep -c 'already configured') == 2 ]] || fail "second run rewrote the network config"
    [[ ! -e "$IWD_WAIT_DROPIN" ]] || fail "desktop got the wlan0 wait"
}

# A laptop's iwd waits for wlan0, written once.
test_configure_network_laptop() {
    FAKE_LAPTOP=1
    configure_network >/dev/null 2>&1
    local unit=sys-subsystem-net-devices-wlan0.device
    [[ $(<"$IWD_WAIT_DROPIN") == "[Unit]"$'\n'"Wants=$unit"$'\n'"After=$unit" ]] || fail "unexpected iwd drop-in"
    [[ $(configure_network 2>/dev/null | grep -c 'already configured') == 3 ]] || fail "second laptop run rewrote the network config"
}

# The X11 keymap SDDM's greeter uses matches Hyprland's, set once.
test_configure_keyboard() {
    configure_keyboard >/dev/null
    [[ $(<"$LOCALECTL_STATE") == "ch pc105 fr" ]] || fail "unexpected X11 keymap: $(<"$LOCALECTL_STATE")"

    configure_keyboard | grep -q 'already configured' || fail "second run did not detect the keymap"
    [[ $(wc -l < "$LOCALECTL_LOG") == 1 ]] || fail "second run changed the keymap again"
}

test_configure_pacman
test_configure_network
test_configure_network_laptop
test_configure_keyboard

echo "PASS: setup_arch"
