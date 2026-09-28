#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
helper="$repo_root/scripts/system/system-restart-quickshell.sh"
idle="$repo_root/dot/.config/hypr/hypridle.conf"
hypr="$repo_root/dot/.config/hypr/hyprland.conf"
unit="$repo_root/dot/.config/systemd/user/leo-quickshell.service"
symlinks="$repo_root/install/symlinks.sh"

grep -Eq 'after_sleep_cmd[[:space:]]*=[[:space:]]*hyprctl dispatch dpms on && system-restart-quickshell.sh' "$idle"
grep -Eq 'exec-once[[:space:]]*=[[:space:]]*systemctl --user start leo-quickshell.service' "$hypr" || { echo 'FAIL: Hyprland starts an unsupervised bar' >&2; exit 1; }
grep -Fq '".config/systemd/user/leo-quickshell.service"' "$symlinks"
grep -Eq '^ExecStart=.*quickshell -n -p ' "$unit"
grep -qx 'Restart=always' "$unit"
grep -qx 'PartOf=graphical-session.target' "$unit"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"
export QS_TEST_LOG="$tmp/actions" QS_TEST_DISPLAY=up

cat > "$tmp/bin/hyprctl" <<'MOCK'
#!/usr/bin/env bash
printf 'monitor\n' >> "$QS_TEST_LOG"
if [[ "$QS_TEST_DISPLAY" == up ]]; then
  printf '[{"name":"DP-5","dpmsStatus":true}]\n'
else
  printf '[{"name":"DP-5","dpmsStatus":false}]\n'
fi
MOCK
cat > "$tmp/bin/systemctl" <<'MOCK'
#!/usr/bin/env bash
case "$*" in
  '--user restart leo-quickshell.service') printf 'restart\n' >> "$QS_TEST_LOG" ;;
  '--user is-active --quiet leo-quickshell.service') exit 0 ;;
  *) exit 1 ;;
esac
MOCK
cat > "$tmp/bin/quickshell" <<'MOCK'
#!/usr/bin/env bash
[[ "$*" == 'list --all' ]]
printf 'Instance test:\n  Config path: %s/.config/quickshell/leo-shell/shell.qml\n' "$HOME"
MOCK
chmod +x "$tmp/bin/"*
PATH="$tmp/bin:$PATH" "$helper"
if [[ "$(paste -sd, "$QS_TEST_LOG")" != 'monitor,restart' ]]; then
  echo "FAIL: wake did not restart the supervised service: $(paste -sd, "$QS_TEST_LOG")" >&2
  exit 1
fi

: > "$QS_TEST_LOG"
export QS_TEST_DISPLAY=down
if PATH="$tmp/bin:$PATH" "$helper" 2>/dev/null; then
  echo 'FAIL: restart succeeded with no active display' >&2
  exit 1
fi
if grep -q restart "$QS_TEST_LOG"; then
  echo 'FAIL: restart attempted with no active display' >&2
  exit 1
fi

echo 'PASS: wake restarts the supervised bar only after the display is ready'
