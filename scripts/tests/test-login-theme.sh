#!/usr/bin/env bash
# Headless Qt 6 tests. The fixture mocks every SDDM auth and power API.
# Optional captures: --capture-dir /tmp/leo-login-captures --wallpaper /path/to/image.jpg
set -Eeuo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
capture_dir=""
wallpaper=""
while (($#)); do
    case "$1" in
        --capture-dir|--wallpaper)
            (($# >= 2)) || { echo "Missing value for $1" >&2; exit 2; }
            if [[ "$1" == --capture-dir ]]; then capture_dir=$2; else wallpaper=$2; fi
            shift 2
            ;;
        *) echo "Usage: $0 [--capture-dir DIRECTORY] [--wallpaper IMAGE]" >&2; exit 2 ;;
    esac
done

runner=${QT6_QMLTESTRUNNER:-}
if [[ -z "$runner" ]]; then
    for candidate in /usr/lib/qt6/bin/qmltestrunner /usr/lib64/qt6/bin/qmltestrunner qmltestrunner6 qmltestrunner; do
        if command -v "$candidate" >/dev/null 2>&1; then
            runner=$(command -v "$candidate")
            break
        fi
    done
fi
[[ -n "$runner" ]] || { echo 'Qt 6 qmltestrunner is required.' >&2; exit 1; }
command -v python3 >/dev/null || { echo 'python3 is required.' >&2; exit 1; }
command -v timeout >/dev/null || { echo 'timeout is required.' >&2; exit 1; }
if [[ -n "$wallpaper" && ! -f "$wallpaper" ]]; then
    echo "Wallpaper does not exist: $wallpaper" >&2
    exit 2
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
# Only the generated wrapper and optional wallpaper live in TMP. Nothing is
# installed, and the tests never load SDDM's real daemon proxy.
python3 - "$ROOT" "$TMP" "$capture_dir" "$wallpaper" <<'PY'
import json
from pathlib import Path
import sys

root, tmp = map(Path, sys.argv[1:3])
captures = Path(sys.argv[3]).resolve() if sys.argv[3] else None
if captures:
    captures.mkdir(parents=True, exist_ok=True)
wallpaper = Path(sys.argv[4]).resolve() if sys.argv[4] else tmp / 'wallpaper.svg'
if not sys.argv[4]:
    wallpaper.write_text('<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">'
                         '<rect width="1280" height="720" fill="#303542"/></svg>\n')
fixture = (root / 'scripts/tests/fixtures/login-theme').as_uri()
source = (root / 'dot/.config/leo/login/Main.qml').as_uri()
wrapper = ('import QtQuick\n'
           f'import {json.dumps(fixture)} as Fixtures\n'
           'Fixtures.LoginThemeTests {\n'
           f'    themeUrl: {json.dumps(source)}\n'
           f'    wallpaperUrl: {json.dumps(wallpaper.as_uri())}\n'
           f'    captureDirectory: {json.dumps(str(captures) if captures else "")}\n'
           '}\n')
(tmp / 'tst_login.qml').write_text(wrapper)
PY

backend=${QT_QUICK_BACKEND:-software}
if [[ -n "$capture_dir" ]]; then backend=${QT_QUICK_BACKEND:-rhi}; fi
# Do not inherit a desktop input-method plugin into these isolated tests.
timeout 30s env QT_QPA_PLATFORM=offscreen QT_QUICK_BACKEND="$backend" \
    QSG_RHI_BACKEND="${QSG_RHI_BACKEND:-opengl}" QT_IM_MODULE= \
    QT_FORCE_STDERR_LOGGING=1 "$runner" -input "$TMP" -o -,txt
if [[ -n "$capture_dir" ]]; then
    python3 - "$capture_dir" <<'PY'
from pathlib import Path
import struct
import sys

for width, height in [(800, 600), (1280, 720), (1920, 1080), (2560, 1440)]:
    for state in ['login', 'error', 'confirm']:
        image = Path(sys.argv[1]) / f'{width}x{height}-{state}.png'
        data = image.read_bytes()
        assert data[:8] == b'\x89PNG\r\n\x1a\n', image
        assert struct.unpack('>II', data[16:24]) == (width, height), image
PY
    printf 'Captures: %s\n' "$(cd -- "$capture_dir" && pwd)"
fi
