#!/usr/bin/env bash
# CLI tests use a fake home/root. Never sudo or touch the running display manager.
set -Eeuo pipefail
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
exec python3 - "$ROOT/scripts/system/system-login-install.sh" <<'PY'
import configparser
import hashlib
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile

SCRIPT = Path(sys.argv[1])
FONT_NAMES = ('JetBrainsMonoNerdFont-Regular.ttf', 'JetBrainsMonoNerdFont-Medium.ttf',
              'JetBrainsMonoNerdFont-SemiBold.ttf', 'JetBrainsMonoNerdFont-Bold.ttf',
              'JetBrainsMonoNerdFontPropo-Regular.ttf')
THEME = Path('usr/share/sddm/themes/leo')
FONTS = Path('usr/local/share/fonts/leo')
DROP = Path('etc/sddm.conf.d/99-leo-theme.conf')
STATE = Path('var/lib/leo-login-install/backups')
MAIN_TEXT = '''# Keep this comment and formatting
[Theme]
Current = silent
CursorTheme=Bibata

[General]
DisplayServer=wayland
InputMethod=qtvirtualkeyboard
GreeterEnvironment=QML2_IMPORT_PATH=/usr/share/sddm/themes/silent/components,QT_IM_MODULE=qtvirtualkeyboard

[Autologin]
User=leo
Session=hyprland.desktop
Relogin=false

[Users]
MinimumUid=1000
RememberLastSession=true

[Wayland]
SessionDir=/usr/share/wayland-sessions
SessionCommand=/usr/share/sddm/scripts/wayland-session

[X11]
SessionCommand=/usr/share/sddm/scripts/Xsession
'''
AUTO_TEXT = '[Theme]\nCurrent=breeze\n[Autologin]\nUser=leo\nSession=hyprland.desktop\n'


def write(path, data, mode=0o644):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data.encode() if isinstance(data, str) else data)
    path.chmod(mode)


def tree(root):
    return {str(p.relative_to(root)): (hashlib.sha256(p.read_bytes()).hexdigest(),
                                      stat.S_IMODE(p.stat().st_mode), p.stat().st_mtime_ns)
            for p in root.rglob('*') if p.is_file() and not p.is_symlink()}


def fixture(base, main=True):
    home, root = base / 'home', base / 'root'
    home.mkdir(parents=True)
    root.mkdir()
    # ~/.config/leo is a repository symlink, not a copied config directory.
    repo = base / 'repo-leo'
    write(repo / 'login/Main.qml', 'import QtQuick 2.15\nItem {}\n', 0o600)
    write(repo / 'login/theme.conf', '[General]\nwallpaper=wallpaper.jpg\n')
    write(repo / 'login/theme.conf.user', '[General]\nwallpaper=wallpaper.jpg\nfontFamily=JetBrainsMono Nerd Font\n')
    write(repo / 'login/metadata.desktop', '[SddmGreeterTheme]\nMainScript=Main.qml\n')
    (home / '.config').mkdir()
    (home / '.config/leo').symlink_to(repo, target_is_directory=True)
    write(base / 'private-picture.jpg', b'\xff\xd8wallpaper bytes\xff\xd9', 0o600)
    (repo / 'wallpaper').mkdir()
    (repo / 'wallpaper/current.jpg').symlink_to(base / 'private-picture.jpg')
    for name in FONT_NAMES:
        write(home / '.local/share/fonts/NerdFonts' / name, b'\x00\x01\x00\x00font ' + name.encode(), 0o600)
    if main:
        write(root / 'etc/sddm.conf', MAIN_TEXT, 0o640)
    write(root / 'etc/sddm.conf.d/autologin.conf', AUTO_TEXT)
    write(root / 'etc/pam.d/sddm', '# untouched PAM\n')
    write(root / 'etc/passwd', 'leo:x:1000:1000:Leo:/home/leo:/bin/bash\n')
    write(root / 'usr/share/wayland-sessions/hyprland.desktop', '[Desktop Entry]\nExec=Hyprland\n')
    return home, root, repo


def run(home, root, *args, ok=True):
    env = dict(os.environ, HOME=str(home), XDG_CONFIG_HOME=str(home / '.config'),
               PATH=str(BIN) + os.pathsep + os.environ['PATH'])
    result = subprocess.run(['bash', str(SCRIPT), '--stage', str(root), *args], env=env,
                            text=True, capture_output=True, umask=0o077)
    if (result.returncode == 0) != ok:
        raise AssertionError(f'Unexpected exit {result.returncode}: {result.stdout}\n{result.stderr}')
    assert not CALLS.exists(), 'Installer invoked a forbidden command'
    return result


def readable(root, path):
    file = root / path
    assert file.is_file() and not file.is_symlink()
    assert stat.S_IMODE(file.stat().st_mode) == 0o644, file
    for parent in file.parents:
        if parent == root:
            break
        assert parent.stat().st_mode & 0o001, parent


def selected(root):
    conf = configparser.ConfigParser(interpolation=None, strict=False)
    files = sorted((root / 'usr/lib/sddm/sddm.conf.d').glob('*.conf'))
    files += sorted((root / 'etc/sddm.conf.d').glob('*.conf'))
    files += [root / 'etc/sddm.conf']
    conf.read(files)
    assert conf['Theme']['Current'] == 'leo'
    assert conf['General']['InputMethod'] == ''
    assert conf['General']['GreeterEnvironment'] == 'QT_IM_MODULE='


with tempfile.TemporaryDirectory(prefix='leo-login-test-') as temporary:
    base = Path(temporary)
    BIN = base / 'bin'
    CALLS = base / 'forbidden-command'
    for command in ('sudo', 'systemctl', 'service', 'sddm', 'sddm-greeter', 'reboot', 'shutdown',
                    'loginctl', 'kill', 'killall', 'pkill', 'fc-cache'):
        write(BIN / command, '#!/bin/sh\nprintf "%s\\n" "$0 $*" >> ' + str(CALLS) + '\nexit 99\n', 0o755)

    home, root, repo = fixture(base / 'normal')
    original = tree(root)
    # A dry run creates neither destinations nor backups.
    result = run(home, root, '--dry-run')
    assert 'No writes or sudo' in result.stdout
    assert tree(root) == original
    assert not (root / STATE).exists()
    nonexistent = base / 'dry-root'
    run(home, nonexistent, '--dry-run')
    assert not nonexistent.exists()

    # Preserve unrelated settings even in an existing installer drop-in.
    old_drop = '[General]\nNumlock=on\n# owned by someone else\n[Users]\nHideUsers=guest\n'
    write(root / DROP, old_drop)
    original = tree(root)
    result = run(home, root)
    backup_id = re.search(r'--rollback (\S+)', result.stdout)[1]
    selected(root)
    expected = MAIN_TEXT.replace('Current = silent', 'Current=leo').replace(
        'InputMethod=qtvirtualkeyboard', 'InputMethod=').replace(
        'GreeterEnvironment=QML2_IMPORT_PATH=/usr/share/sddm/themes/silent/components,QT_IM_MODULE=qtvirtualkeyboard',
        'GreeterEnvironment=QT_IM_MODULE=')
    assert (root / 'etc/sddm.conf').read_text() == expected
    assert stat.S_IMODE((root / 'etc/sddm.conf').stat().st_mode) == 0o640
    assert '# owned by someone else\n' in (root / DROP).read_text()
    assert 'Numlock=on\n' in (root / DROP).read_text()
    assert 'HideUsers=guest\n' in (root / DROP).read_text()
    for name, value in original.items():
        if name not in ('etc/sddm.conf', str(DROP)):
            assert tree(root)[name] == value, name
    assert (root / THEME / 'wallpaper.jpg').read_bytes() == (repo / 'wallpaper/current.jpg').read_bytes()
    for name in ('Main.qml', 'theme.conf', 'theme.conf.user', 'metadata.desktop', 'wallpaper.jpg'):
        readable(root, THEME / name)
    for name in FONT_NAMES:
        readable(root, FONTS / name)
        assert (root / FONTS / name).read_bytes() == (home / '.local/share/fonts/NerdFonts' / name).read_bytes()
    assert str(home) not in (root / THEME / 'theme.conf.user').read_text()
    assert stat.S_IMODE((root / STATE / backup_id / 'manifest.json').stat().st_mode) == 0o600
    installed = tree(root)
    assert 'Already installed' in run(home, root).stdout
    assert tree(root) == installed, 'Idempotent run rewrote files or added backups'

    # Rollback checks every destination before touching any of them.
    write(root / THEME / 'Main.qml', 'subsequent edit\n')
    edited = tree(root)
    assert 'subsequent edit' in run(home, root, '--rollback', backup_id, ok=False).stderr
    assert tree(root) == edited
    write(root / THEME / 'Main.qml', (repo / 'login/Main.qml').read_bytes())
    before_rollback = tree(root)
    run(home, root, '--rollback', backup_id, '--dry-run')
    assert tree(root) == before_rollback
    run(home, root, '--rollback', backup_id)
    for name, value in original.items():
        actual = tree(root)[name]
        assert actual[:2] == value[:2], name
    assert not (root / THEME / 'Main.qml').exists()
    assert not (root / FONTS / FONT_NAMES[0]).exists()
    assert (root / STATE / backup_id / 'manifest.json').exists()
    run(home, root, '--rollback', backup_id)  # Repeat rollback is harmless.

    # No compatibility config needs creating when a late drop-in suffices.
    home2, root2, repo2 = fixture(base / 'drop-only', main=False)
    auth_only = '[Autologin]\nUser=leo\nSession=hyprland.desktop\n'
    write(root2 / 'etc/sddm.conf.d/autologin.conf', auth_only)
    write(root2 / 'etc/sddm.conf.d/zz-unrelated.conf', '[Users]\nHideUsers=nobody\n')
    run(home2, root2)
    selected(root2)
    assert not (root2 / 'etc/sddm.conf').exists()
    assert (root2 / 'etc/sddm.conf.d/autologin.conf').read_text() == auth_only
    # But a lexically later conflicting drop-in needs the compatibility override.
    home3, root3, repo3 = fixture(base / 'late-drop', main=False)
    write(root3 / 'etc/sddm.conf.d/zz-local.conf', '[Theme]\nCurrent=breeze\n')
    run(home3, root3)
    selected(root3)
    assert (root3 / 'etc/sddm.conf').exists()

    # Existing system-wide fonts are sufficient, but private copies are not.
    home4, root4, repo4 = fixture(base / 'system-fonts')
    for name in FONT_NAMES:
        (home4 / '.local/share/fonts/NerdFonts' / name).unlink()
        write(root4 / 'usr/share/fonts/TTF' / name, b'\x00\x01\x00\x00system font')
    run(home4, root4)
    selected(root4)
    assert not (root4 / FONTS).exists()
    # A symlink into a private tree does not count as a system-wide font.
    h, r, t = fixture(base / 'private-font-link')
    font = h / '.local/share/fonts/NerdFonts' / FONT_NAMES[0]
    private = h / 'private-font.ttf'
    font.rename(private)
    private.chmod(0o644)
    link = r / 'usr/share/fonts/TTF' / FONT_NAMES[0]
    link.parent.mkdir(parents=True)
    link.symlink_to(private)
    run(h, r, ok=False)
    assert not (r / DROP).exists()

    # Missing/bad inputs or unsafe destinations must leave all selections alone.
    failures = {
        'wallpaper': lambda h, r, t: (t / 'wallpaper/current.jpg').unlink(),
        'font': lambda h, r, t: (h / '.local/share/fonts/NerdFonts' / FONT_NAMES[0]).unlink(),
        'bad-font': lambda h, r, t: write(h / '.local/share/fonts/NerdFonts' / FONT_NAMES[0], 'not a font'),
        'private-wallpaper': lambda h, r, t: write(t / 'login/theme.conf.user', '[General]\nwallpaper=/home/leo/private.jpg\n'),
        'wrong-wallpaper': lambda h, r, t: write(t / 'login/theme.conf.user', '[General]\nwallpaper=../private.jpg\n'),
        'missing-qml': lambda h, r, t: (t / 'login/Main.qml').unlink(),
        'theme-subtree': lambda h, r, t: write(t / 'login/private/secret', 'do not copy'),
        'theme-symlink': lambda h, r, t: (t / 'login/Extra.qml').symlink_to(t / 'login/Main.qml'),
        'theme-dir': lambda h, r, t: write(r / 'etc/sddm.conf', MAIN_TEXT + '\n[Theme]\nThemeDir=/private/themes\n'),
        'dest-directory': lambda h, r, t: (r / THEME / 'theme.conf.user').mkdir(parents=True),
        'dest-symlink': lambda h, r, t: (r / 'etc/sddm.conf').symlink_to(t / 'login/theme.conf'),
    }
    for label, mutate in failures.items():
        h, r, t = fixture(base / ('failure-' + label))
        if label == 'dest-symlink':
            (r / 'etc/sddm.conf').unlink()
        mutate(h, r, t)
        before = tree(r)
        run(h, r, ok=False)
        assert tree(r) == before, label + ' changed files'
        assert not (r / STATE).exists(), label + ' created a partial backup'
        assert not (r / DROP).exists(), label + ' partially selected theme'

    # A write failure after asset writes must undo them before returning an error.
    if os.geteuid() != 0:
        h, r, t = fixture(base / 'write-failure')
        (r / FONTS).mkdir(parents=True)
        (r / FONTS).chmod(0o555)
        before = tree(r)
        result = run(h, r, ok=False)
        assert 'Permission denied' in result.stderr
        assert (r / 'etc/sddm.conf').read_text() == MAIN_TEXT
        assert not (r / DROP).exists()
        assert not (r / THEME / 'Main.qml').exists()
        actual = {name: entry for name, entry in tree(r).items() if not name.startswith(str(STATE) + '/')}
        assert actual == before
        (r / FONTS).chmod(0o755)

    # Validate dependencies and inputs without ever reaching the sudo stub.
    h, r, t = fixture(base / 'pre-sudo')
    (t / 'wallpaper/current.jpg').unlink()
    env = dict(os.environ, HOME=str(h), XDG_CONFIG_HOME=str(h / '.config'),
               PATH=str(BIN) + os.pathsep + os.environ['PATH'])
    result = subprocess.run(['/bin/bash', str(SCRIPT)], env=env, text=True, capture_output=True)
    assert result.returncode != 0 and not CALLS.exists()
    result = subprocess.run(['/bin/bash', str(SCRIPT), '--rollback', '../bad'],
                            env=env, text=True, capture_output=True)
    assert result.returncode != 0 and 'backup ID' in result.stderr and not CALLS.exists()
    result = subprocess.run(['/bin/bash', str(SCRIPT), '--rollback', backup_id, '--dry-run'],
                            env=env, text=True, capture_output=True)
    assert result.returncode != 0 and 'Rollback dry-runs require --stage' in result.stderr
    assert not CALLS.exists()
    env['PATH'] = str(BIN)  # no python3
    result = subprocess.run(['/bin/bash', str(SCRIPT), '--stage', str(r)],
                            env=env, text=True, capture_output=True)
    assert result.returncode != 0 and 'Missing dependency: python3' in result.stderr
    assert not CALLS.exists() and not (r / DROP).exists()
    run(h, Path('/'), ok=False)
    run(h, h, ok=False)

    # Reinstalling a changed wallpaper gets its own reversible backup.
    h, r, t = fixture(base / 'updated-wallpaper')
    first = run(h, r)
    write(t / 'wallpaper/current.jpg', b'\xff\xd8updated\xff\xd9')
    second = run(h, r)
    second_id = re.search(r'--rollback (\S+)', second.stdout)[1]
    assert len(list((r / STATE).iterdir())) == 2
    assert (r / THEME / 'wallpaper.jpg').read_bytes() == b'\xff\xd8updated\xff\xd9'
    run(h, r, '--rollback', second_id)
    assert (r / THEME / 'wallpaper.jpg').read_bytes() == b'\xff\xd8wallpaper bytes\xff\xd9'
    selected(r)

    # Duplicate sections/keys and CRLF retain every unrelated byte.
    h, r, t = fixture(base / 'duplicate-config')
    text = '# header\r\n[Theme]\r\nCurrent=silent\r\n[Users]\r\nHideUsers=guest\r\n[Theme]\r\nCurrent=breeze\r\n'
    write(r / 'etc/sddm.conf', text)
    run(h, r)
    changed = (r / 'etc/sddm.conf').read_bytes()
    assert changed.count(b'Current=leo\r\n') == 2
    assert b'[Users]\r\nHideUsers=guest\r\n' in changed
    assert b'GreeterEnvironment=QT_IM_MODULE=\r\n' in changed

print('PASS: system-login-install staging, config preservation, readability, rollback, validation and idempotency')
PY
