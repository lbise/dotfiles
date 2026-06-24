#!/usr/bin/env bash
set -Eeuo pipefail

handler="${PI_OPEN_HANDLER:-$HOME/.scripts/pi-open-handler}"
desktop_dir="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
desktop_file="$desktop_dir/pi-open.desktop"

if [[ ! -x "$handler" ]]; then
  echo "Handler is not executable: $handler" >&2
  echo "Set PI_OPEN_HANDLER=/path/to/pi-open-handler or run dotfiles symlink install." >&2
  exit 1
fi

mkdir -p "$desktop_dir"
cat > "$desktop_file" <<EOF
[Desktop Entry]
Type=Application
Name=Pi Open URL Handler
Comment=POC handler for pi-open:// terminal hyperlinks
Exec=$handler %u
MimeType=x-scheme-handler/pi-open;
NoDisplay=true
Terminal=false
EOF

xdg-mime default pi-open.desktop x-scheme-handler/pi-open
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$desktop_dir" >/dev/null 2>&1 || true
fi

echo "Registered pi-open:// handler: $handler"
echo "Test with: xdg-open 'pi-open://echo?message=hello'"
