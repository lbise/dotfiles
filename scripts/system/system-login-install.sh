#!/usr/bin/env bash
# Install only the Leo SDDM theme, its wallpaper/fonts, and three SDDM keys.
set -Eeuo pipefail
command -v python3 >/dev/null || { echo 'Missing dependency: python3' >&2; exit 1; }
exec python3 - "$@" <<'PY'
import argparse
import base64
import configparser
import json
import os
from pathlib import Path
import shlex
import shutil
import stat
import subprocess
import sys

# The privileged helper receives bytes, not a source directory to copy recursively.
# It has no service-management code and accepts only the destinations below.
HELPER = r'''
import base64
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile
import uuid

THEME = 'usr/share/sddm/themes/leo'
FONTS = 'usr/local/share/fonts/leo'
STATE = 'var/lib/leo-login-install/backups'
DROP = 'etc/sddm.conf.d/99-leo-theme.conf'
MAIN = 'etc/sddm.conf'
KEYS = {'Theme': {'Current': 'leo'},
        'General': {'InputMethod': '', 'GreeterEnvironment': 'QT_IM_MODULE='}}
FONT_NAMES = {'JetBrainsMonoNerdFont-Regular.ttf', 'JetBrainsMonoNerdFont-Bold.ttf',
              'JetBrainsMonoNerdFontPropo-Regular.ttf'}


def allowed(name):
    p = Path(name)
    if p.is_absolute() or '..' in p.parts:
        return False
    if name in (DROP, MAIN):
        return True
    if str(p.parent) == FONTS:
        return p.name in FONT_NAMES
    if str(p.parent) == THEME:
        return (p.name in {'theme.conf', 'theme.conf.user', 'metadata.desktop', 'qmldir', 'wallpaper.jpg'}
                or p.suffix in {'.qml', '.js', '.svg', '.png', '.jpg', '.jpeg', '.webp'})
    return False


def safe(root, name):
    p = root / name
    for component in [p, *p.parents]:
        if component == root:
            break
        if component.is_symlink():
            raise ValueError('Refusing symlink destination: ' + str(component))
        if component.exists() and component != p and not component.is_dir():
            raise ValueError('Not a directory: ' + str(component))
    if p.exists() and not p.is_file() and not p.is_dir():
        raise ValueError('Not a regular destination: ' + str(p))
    return p


def digest(data):
    return hashlib.sha256(data).hexdigest()


def patch(text):
    # Retain every unrelated line, section and comment, including duplicate sections.
    lines = text.splitlines(keepends=True)
    newline = '\r\n' if '\r\n' in text else '\n'
    section = None
    found = {name: set() for name in KEYS}
    output = []
    for line in lines:
        header = re.match(r'^\s*\[([^]]+)\]\s*(?:[#;].*)?$', line.rstrip('\r\n'))
        if header:
            section = header[1]
        key = re.match(r'^(\s*)([^=\s]+)\s*=', line)
        if key and section in KEYS and key[2] in KEYS[section]:
            name = key[2]
            found[section].add(name)
            line = key[1] + name + '=' + KEYS[section][name] + newline
        output.append(line)
    # Insert missing keys at the end of the last matching section.
    for section, values in KEYS.items():
        missing = [key + '=' + value + newline for key, value in values.items()
                   if key not in found[section]]
        if not missing:
            continue
        if output and not output[-1].endswith('\n'):
            output[-1] += newline
        starts = [i for i, line in enumerate(output)
                  if re.match(r'^\s*\[' + re.escape(section) + r'\]\s*(?:[#;].*)?$', line.rstrip('\r\n'))]
        if starts:
            end = next((i for i in range(starts[-1] + 1, len(output))
                        if re.match(r'^\s*\[', output[i])), len(output))
            output[end:end] = missing
        else:
            if output and output[-1].strip():
                output.append(newline)
            output += ['[' + section + ']' + newline, *missing]
    return ''.join(output)


def write_atomic(path, data, mode, uid=None, gid=None):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
    fd, temporary = tempfile.mkstemp(prefix='.leo-install-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
            os.fchmod(stream.fileno(), mode)
            if uid is not None and os.geteuid() == 0:
                os.fchown(stream.fileno(), uid, gid)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def snapshot(path):
    if not path.exists():
        return {'data': None}
    if not path.is_file():
        raise ValueError('Not a regular file: ' + str(path))
    s = path.stat()
    return {'data': base64.b64encode(path.read_bytes()).decode(),
            'mode': stat.S_IMODE(s.st_mode), 'uid': s.st_uid, 'gid': s.st_gid}


def restore(root, name, entry):
    path = safe(root, name)
    if entry['data'] is None:
        path.unlink(missing_ok=True)
    else:
        write_atomic(path, base64.b64decode(entry['data']), entry['mode'], entry['uid'], entry['gid'])


def install(root, payload, dry=False):
    updates = {}
    for name, encoded in payload.items():
        if not allowed(name) or name in (MAIN, DROP):
            raise ValueError('Invalid payload destination: ' + name)
        data = base64.b64decode(encoded, validate=True)
        if not data:
            raise ValueError('Empty payload: ' + name)
        updates[name] = data
    for required in ('Main.qml', 'theme.conf', 'theme.conf.user', 'wallpaper.jpg'):
        if THEME + '/' + required not in updates:
            raise ValueError('Missing theme payload: ' + required)
    # sddm.conf(5): /usr/lib drop-ins, /etc drop-ins, then /etc/sddm.conf.
    # Refuse a custom ThemeDir rather than silently selecting a nonexistent theme.
    configs = []
    for directory in ('usr/lib/sddm/sddm.conf.d', 'etc/sddm.conf.d'):
        folder = safe(root, directory)
        if folder.exists():
            configs.extend(sorted(folder.glob('*.conf')))
    main = safe(root, MAIN)
    if main.exists():
        configs.append(main)
    theme_dir = '/usr/share/sddm/themes'
    for file in configs:
        section = None
        for line in file.read_text().splitlines():
            header = re.match(r'^\s*\[([^]]+)\]', line)
            if header:
                section = header[1]
            setting = re.match(r'^\s*ThemeDir\s*=\s*(.*?)\s*$', line)
            if section == 'Theme' and setting:
                theme_dir = setting[1]
    if theme_dir.rstrip('/') != '/usr/share/sddm/themes':
        raise ValueError('Custom ThemeDir is not supported: ' + theme_dir)
    drop = safe(root, DROP)
    updates[DROP] = patch(drop.read_bytes().decode('utf-8') if drop.exists() else '').encode()
    if main.exists():
        updates[MAIN] = patch(main.read_bytes().decode('utf-8')).encode()
    else:
        # A later drop-in must not silently undo the selection. Add the final-file
        # override only when such a file supplies one of our keys.
        later = [p for p in configs if p.parent == drop.parent and p.name > drop.name]
        for file in later:
            section = None
            for line in file.read_text().splitlines():
                header = re.match(r'^\s*\[([^]]+)\]', line)
                if header:
                    section = header[1]
                key = re.match(r'^\s*([^=\s]+)\s*=', line)
                if key and section in KEYS and key[1] in KEYS[section]:
                    updates[MAIN] = patch('').encode()
                    break
    before = {}
    changed = {}
    for name, data in updates.items():
        path = safe(root, name)
        old = snapshot(path)
        mode = old.get('mode', 0o644) if name in (MAIN, DROP) else 0o644
        if old['data'] == base64.b64encode(data).decode() and old.get('mode') == mode:
            continue
        before[name] = old
        changed[name] = (data, mode)
    # Validate backup and leaf directories before writing anything.
    for directory in (THEME, FONTS, STATE):
        path = safe(root, directory)
        if path.exists() and not path.is_dir():
            raise ValueError('Not a directory: ' + str(path))
    for directory in (THEME, FONTS):
        leaf = root / directory
        for parent in leaf.parents:
            if parent == root:
                break
            if parent.exists() and not parent.stat().st_mode & stat.S_IXOTH:
                raise ValueError('Asset parent is not world-traversable: ' + str(parent))
    if dry:
        print('Validated. Would update ' + str(len(changed)) + ' files. No writes or sudo.')
        return
    if not changed:
        for directory in (THEME, FONTS):
            path = root / directory
            if path.exists():
                path.chmod(0o755)
        print('Already installed; no changes or new backup.')
        return
    os.umask(0o022)
    backup_id = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ-') + uuid.uuid4().hex[:8]
    backup = safe(root, STATE + '/' + backup_id)
    backup.mkdir(parents=True, mode=0o700)
    backup.chmod(0o700)
    manifest = {'before': before, 'after': {name: digest(data) for name, (data, _) in changed.items()}}
    write_atomic(backup / 'manifest.json', json.dumps(manifest, indent=2).encode(), 0o600)
    applied = []
    try:
        # Assets first, config selection last. Roll back files on a write failure.
        for name, (data, mode) in changed.items():
            path = safe(root, name)
            uid = before[name].get('uid') if name in (MAIN, DROP) else 0
            gid = before[name].get('gid') if name in (MAIN, DROP) else 0
            write_atomic(path, data, mode, uid, gid)
            applied.append(name)
        if root == Path('/') and any(name.startswith(FONTS + '/') for name in changed):
            subprocess.run(['/usr/bin/fc-cache', '-f', '/' + FONTS], check=True, timeout=60)
        for directory in (THEME, FONTS):
            path = root / directory
            if path.exists():
                path.chmod(0o755)
    except BaseException:
        for name in reversed(applied):
            restore(root, name, before[name])
        raise
    print('Installed. Backup: /' + STATE + '/' + backup_id)
    print('Rollback: system-login-install.sh --rollback ' + backup_id)
    print('No display-manager action taken. The theme is used when SDDM next starts.')


def validate_backup_id(backup_id):
    if not re.fullmatch(r'[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}', backup_id):
        raise ValueError('Use the backup ID printed by the installer.')


def rollback(root, backup_id, dry=False):
    validate_backup_id(backup_id)
    backup = safe(root, STATE + '/' + backup_id + '/manifest.json')
    manifest = json.loads(backup.read_text())
    pending = {}
    for name, entry in manifest['before'].items():
        if not allowed(name):
            raise ValueError('Invalid backup destination: ' + name)
        path = safe(root, name)
        current = snapshot(path)
        if current == entry:
            continue
        if current['data'] is None or digest(base64.b64decode(current['data'])) != manifest['after'][name]:
            raise ValueError('Refusing to overwrite a subsequent edit: ' + str(path))
        pending[name] = entry
    if dry:
        print('Would restore ' + str(len(pending)) + ' files.')
        return
    # Restore config first so it no longer selects newly installed assets.
    for name in sorted(pending, key=lambda n: (not n.startswith('etc/'), n)):
        restore(root, name, pending[name])
    if root == Path('/') and any(name.startswith(FONTS + '/') for name in pending):
        subprocess.run(['/usr/bin/fc-cache', '-f', '/' + FONTS], check=True, timeout=60)
    print('Restored ' + str(len(pending)) + ' files. Backups retained. No display-manager action taken.')


if __name__ == '__main__':
    try:
        if sys.argv[1] == 'apply':
            install(Path('/'), json.load(sys.stdin))
        else:
            rollback(Path('/'), sys.argv[2])
    except (OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        print('system-login-install: ' + str(error), file=sys.stderr)
        sys.exit(1)
'''

parser = argparse.ArgumentParser(prog='system-login-install.sh',
    description='Install the Leo SDDM theme without restarting anything.',
    epilog='Run as your desktop user, NOT with sudo. Apply requests sudo only after input validation. '
           'Backups are retained under /var/lib/leo-login-install/backups. '
           'Rollback restores changed files and removes new files; empty directories remain. '
           'Use --rollback ID, or --stage DIR --rollback ID for a staged tree. '
           'Rollback refuses subsequent edits. No PAM, accounts, sessions or services are changed.')
parser.add_argument('--stage', type=Path, metavar='DIR', help='write a fake root tree, without sudo or daemon actions')
parser.add_argument('--dry-run', action='store_true', help='validate and report, without writes or sudo; rollback dry-runs require --stage')
parser.add_argument('--rollback', metavar='ID', help='restore a preserved backup')
args = parser.parse_args()
namespace = {'__name__': 'leo_install_helper'}
exec(HELPER, namespace)


def readable(path):
    s = path.stat()
    if not path.is_file() or not s.st_size:
        raise ValueError('Missing or empty input: ' + str(path))
    return path.read_bytes()


def world_readable(path, root):
    path = path.resolve()
    if not any(path.is_relative_to(root / directory)
               for directory in ('usr/share/fonts', 'usr/local/share/fonts')):
        return False
    if not path.is_file() or not path.stat().st_mode & stat.S_IROTH:
        return False
    for parent in path.parents:
        if parent == root.parent:
            break
        if not parent.stat().st_mode & stat.S_IXOTH:
            return False
    return True


def payload(root):
    home = Path.home()
    config = Path(os.environ.get('XDG_CONFIG_HOME') or home / '.config')
    theme = config / 'leo/login'
    if not theme.is_dir():
        raise ValueError('Missing theme directory: ' + str(theme))
    result = {}
    # Deliberately flat, allowlisted theme files. Never copy ~/.config/leo or a
    # directory selected by a metadata/config value as root.
    for path in sorted(theme.iterdir()):
        name = namespace['THEME'] + '/' + path.name
        if path.is_symlink() or not path.is_file() or not namespace['allowed'](name) or path.name == 'wallpaper.jpg':
            raise ValueError('Unsupported theme entry: ' + str(path))
        data = readable(path)
        if path.suffix in ('.qml', '.js', '.conf', '.user', '.desktop'):
            text = data.decode('utf-8')
            if any(private in text for private in ('/home/', '/run/user/', str(home) + '/')):
                raise ValueError('Private home/runtime path in theme: ' + str(path))
        result[name] = base64.b64encode(data).decode()
    for name in ('Main.qml', 'theme.conf', 'theme.conf.user'):
        if namespace['THEME'] + '/' + name not in result:
            raise ValueError('Missing theme input: ' + str(theme / name))
    conf = configparser.ConfigParser(interpolation=None)
    conf.read_string(readable(theme / 'theme.conf.user').decode())
    if conf.get('General', 'wallpaper', fallback=None) != 'wallpaper.jpg':
        raise ValueError('theme.conf.user must set [General] wallpaper=wallpaper.jpg')
    wallpaper = readable(config / 'leo/wallpaper/current.jpg')
    result[namespace['THEME'] + '/wallpaper.jpg'] = base64.b64encode(wallpaper).decode()
    local_fonts = home / '.local/share/fonts/NerdFonts'
    for name in sorted(namespace['FONT_NAMES']):
        font = local_fonts / name
        if font.exists():
            data = readable(font)
            if data[:4] not in (b'\x00\x01\x00\x00', b'OTTO', b'true', b'ttcf'):
                raise ValueError('Not a TrueType/OpenType font: ' + str(font))
            result[namespace['FONTS'] + '/' + name] = base64.b64encode(data).decode()
            continue
        # System fonts need not be duplicated. Exclude private/user font paths.
        candidates = []
        for directory in ('usr/share/fonts', 'usr/local/share/fonts'):
            folder = root / directory
            if folder.exists():
                candidates.extend(folder.rglob(name))
        if not any(world_readable(p, root) and p.stat().st_size for p in candidates):
            raise ValueError('Missing font: ' + str(font) + ' and no readable system copy')
    return result


try:
    if args.stage:
        if args.stage.is_symlink():
            raise ValueError('Stage root must not be a symlink')
        root = args.stage.absolute().resolve()
        if root == Path('/') or root == Path.home().resolve():
            raise ValueError('Use a separate staging directory, not / or your home')
        if root.exists() and not root.is_dir():
            raise ValueError('Stage root is not a directory')
    else:
        root = Path('/')
        if os.geteuid() == 0:
            raise ValueError('Run as the desktop user, not root or sudo. Use --stage DIR for tests.')
    if args.rollback:
        namespace['validate_backup_id'](args.rollback)
        if args.dry_run and not args.stage:
            raise ValueError('Rollback dry-runs require --stage; live backup manifests are root-only. '
                             'Live --rollback requests sudo and checks subsequent edits before writing.')
        if args.stage or args.dry_run:
            namespace['rollback'](root, args.rollback, args.dry_run)
        else:
            sudo = shutil.which('sudo')
            if not sudo:
                raise ValueError('Missing dependency: sudo')
            if not os.access('/usr/bin/fc-cache', os.X_OK):
                raise ValueError('Missing dependency: /usr/bin/fc-cache')
            subprocess.run([sudo, '--', sys.executable, '-c', HELPER, 'rollback', args.rollback], check=True)
    else:
        sudo = None
        if not args.stage and not args.dry_run:
            sudo = shutil.which('sudo')
            if not sudo:
                raise ValueError('Missing dependency: sudo')
            if not os.access('/usr/bin/fc-cache', os.X_OK):
                raise ValueError('Missing dependency: /usr/bin/fc-cache')
        data = payload(root)
        # Preflight destination/config errors before requesting privilege, too.
        namespace['install'](root, data, True)
        if args.stage and not args.dry_run:
            namespace['install'](root, data)
            print('Staged only. For staged rollback add --stage ' + shlex.quote(str(root)))
        elif not args.dry_run:
            subprocess.run([sudo, '--', sys.executable, '-c', HELPER, 'apply'],
                           input=json.dumps(data), text=True, check=True)
except (OSError, ValueError, KeyError, configparser.Error, subprocess.SubprocessError) as error:
    print('system-login-install: ' + str(error), file=sys.stderr)
    sys.exit(1)
PY
