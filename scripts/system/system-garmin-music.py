#!/usr/bin/env python3
"""Manage music on a Garmin watch over USB for the Quickshell bar.

KDE's kmtpd (inside kiod6) holds the watch's USB interface, so libmtp tools
report the device as busy. Everything goes through kmtpd's D-Bus API on the
session bus instead, which also lets Dolphin browse the watch at the same time.

The watch's player shows tags, not folder names, so every upload is written
with artist, title and album tags, and files are laid out the way the watch
already does it: /Music/<Artist>/<Album>/<Title>.<ext>. Source files on disk
are never modified; tags are written into a temporary copy.

Usage:
  system-garmin-music.py status                 one JSON status object
  system-garmin-music.py watch                  a status line now and on every change
  system-garmin-music.py list                   artists and tracks under /Music
  system-garmin-music.py probe FILE...          tags and filename guesses for local files
  system-garmin-music.py probe-remote PATH      download a track and read its tags
  system-garmin-music.py add FILE...            upload, tagging from the files and their names
  system-garmin-music.py add --manifest FILE|-  upload with edited tags (JSON list on one line)
  system-garmin-music.py retag PATH [--artist A] [--title T] [--album B]
  system-garmin-music.py retag --manifest FILE|-
  system-garmin-music.py rm PATH                delete a track or folder under /Music

add and retag print one JSON event per line. Manifests are JSON lists:
add takes {"source", "artist", "title", "album"}; retag takes {"path"} plus
any of "artist", "title" and "album" to change (the rest are kept).
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path, PurePosixPath

GARMIN_VENDOR = '091e'
USB_DEVICES = Path('/sys/bus/usb/devices')
SOLID_UDEV_PREFIX = '/org/kde/solid/udev'

KMTPD = 'org.kde.kmtpd5'
DAEMON_PATH = '/modules/kmtpd'
DAEMON_IFACE = 'org.kde.kmtp.Daemon'
DEVICE_IFACE = 'org.kde.kmtp.Device'
STORAGE_IFACE = 'org.kde.kmtp.Storage'

MUSIC_ROOT = '/Music'
UNKNOWN_ARTIST = 'Unknown Artist'
# The watch's existing folders use "Unknown" for tracks without an album.
UNKNOWN_ALBUM = 'Unknown'
DIRECTORY_TYPE = 'inode/directory'
MAX_DEPTH = 4
TAG_FIELDS = ('artist', 'title', 'album')

CONVERT_TO_MP3 = {'.flac', '.ogg', '.oga', '.opus', '.wav'}
# Prefix for the original while its retagged copy is uploaded under its name.
BACKUP_PREFIX = '__retag__'

COMMAND_TIMEOUT = 15
CONVERT_TIMEOUT = 1800
# kmtpd reports progress while a file moves; give up after this long without any.
STALL_TIMEOUT = 120
NO_TIMEOUT = 2**31 - 1
# Downloads made to read a track's tags are kept this long so a retag can reuse them.
CACHE_MAX_AGE = 3600

INVALID_NAME_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f\x7f]')

# Filename clean-up for guessing tags. Each pattern only matches shapes that
# downloaders add, so a real title is left alone.
SITE_PREFIX = re.compile(
    r'^\s*(?:\[\s*[\w.-]+\.[a-z]{2,6}\s*\]|[\w-]+\.(?:to|is|cc|com|net|info|io|me|org|ws|app))\s*(?:-\s+)?',
    re.IGNORECASE)
JUNK_SUFFIXES = (
    re.compile(r'[-_\s]+[A-Za-z0-9_-]{11}-\d{2,3}k-\d{10,13}$'),  # -<YouTube id>-192k-<timestamp>
    re.compile(r'[-_\s]+\d{2,3}k(?:-\d{10,13})?$'),                # -192k, -160k-<timestamp>
    re.compile(r'[-_\s]+-?\d{12,}$'),                              # _-7500864057333045320
)
JUNK_GROUP = re.compile(
    r'\s*[(\[]\s*(?:official(?:\s+(?:music|lyric))?(?:\s+(?:video|audio|visuali[sz]er))?'
    r'|lyrics?(?:\s+video)?|audio|video|visuali[sz]er|hd|hq|4k|\d{2,3}\s*kbps|[\w.-]+\.[a-z]{2,6})\s*[)\]]',
    re.IGNORECASE)
TRACK_NUMBER = re.compile(r'^\s*(?:\d{1,2}|0\d{2})\s*[-.)]\s+')
ARTIST_SEPARATOR = re.compile(r'\s+[-\u2013\u2014]\s+')


class WatchError(Exception):
    """A failure to report to the bar as a readable message."""


# Pure helpers ---------------------------------------------------------------

def sysfs_path_from_udi(udi: str) -> str | None:
    """Solid's udev UDI is the sysfs path behind a fixed prefix."""
    if not udi.startswith(SOLID_UDEV_PREFIX + '/sys/'):
        return None
    return udi[len(SOLID_UDEV_PREFIX):]


def safe_name(text: str, fallback: str, limit: int = 120) -> str:
    """A file or folder name the watch's FAT storage accepts."""
    text = str(text or '').encode('utf-8', 'replace').decode('utf-8')
    text = INVALID_NAME_CHARS.sub('_', text)
    text = ' '.join(text.split())
    text = text[:limit].rstrip(' .')
    return text or fallback


def join_path(*parts: str) -> str:
    return '/' + '/'.join(part.strip('/') for part in parts if part.strip('/'))


def is_deletable(path: str) -> bool:
    """Only tracks and folders inside /Music, never /Music itself."""
    if not path.startswith(MUSIC_ROOT + '/'):
        return False
    parts = path[len(MUSIC_ROOT) + 1:].split('/')
    return all(part not in ('', '.', '..') for part in parts)


def output_format(filename: str) -> tuple[str, str] | None:
    """(extension on the watch, how to get there), or None when the watch can't play it.

    'copy' keeps the audio and rewrites the tags; raw AAC has nowhere to keep
    tags, so it is remuxed into M4A; the rest is converted to MP3.
    """
    suffix = PurePosixPath(filename).suffix.lower()
    if suffix in ('.mp3', '.m4a'):
        return suffix, 'copy'
    if suffix == '.aac':
        return '.m4a', 'remux'
    if suffix in CONVERT_TO_MP3:
        return '.mp3', 'convert'
    return None


def probe_tag(probe: dict, name: str) -> str:
    """A tag from ffprobe JSON, case-insensitive; Ogg and Opus keep tags on the stream."""
    sources = [probe.get('format', {}).get('tags', {})]
    sources += [stream.get('tags', {}) for stream in probe.get('streams', [])]
    for tags in sources:
        for key, value in (tags or {}).items():
            if key.lower() == name and str(value).strip():
                return str(value).strip()
    return ''


def read_tags(probe: dict) -> dict:
    return {name: probe_tag(probe, name) for name in ('artist', 'title', 'album', 'album_artist')}


def guess_from_filename(stem: str) -> dict:
    """Artist and title from names like '01. Artist - Title (Official Video) [320kbps]'."""
    name = stem
    for pattern in JUNK_SUFFIXES:
        name = pattern.sub('', name)
    name = name.replace('_', ' ')
    name = SITE_PREFIX.sub('', name)
    name = JUNK_GROUP.sub('', name)
    name = TRACK_NUMBER.sub('', ' '.join(name.split()))
    name = name.strip(' -.')
    parts = ARTIST_SEPARATOR.split(name, maxsplit=1)
    if len(parts) == 2 and parts[0].strip(' -') and parts[1].strip(' -'):
        return {'artist': parts[0].strip(' -'), 'title': parts[1].strip(' -')}
    return {'artist': '', 'title': name}


def folder_guess(path: str) -> dict:
    """Artist and album from a track's folders on the watch, skipping the 'Unknown' fillers."""
    parts = PurePosixPath(path).relative_to(MUSIC_ROOT).parts
    artist = parts[0] if len(parts) >= 2 else ''
    album = parts[-2] if len(parts) >= 3 else ''
    return {
        'artist': '' if artist == UNKNOWN_ARTIST else artist,
        'album': '' if album == UNKNOWN_ALBUM else album,
    }


def prefill(tags: dict, filename: str, folders: dict | None = None) -> dict:
    """Fields for the edit form: tags first, then folders on the watch, then the filename."""
    folders = folders or {}
    stem = PurePosixPath(filename).stem
    guess = guess_from_filename(stem)
    return {
        'artist': tags.get('artist') or tags.get('album_artist') or folders.get('artist') or guess['artist'],
        'title': tags.get('title') or guess['title'] or stem,
        'album': tags.get('album') or folders.get('album', ''),
    }


def track_path(fields: dict, extension: str) -> dict:
    """Where a track with these tags lives: /Music/<Artist>/<Album>/<Title>.<ext>."""
    artist = safe_name(fields.get('artist'), UNKNOWN_ARTIST)
    album = safe_name(fields.get('album'), UNKNOWN_ALBUM)
    name = safe_name(fields.get('title'), 'Track', limit=100) + extension
    return {
        'name': name,
        'folders': [join_path(MUSIC_ROOT, artist), join_path(MUSIC_ROOT, artist, album)],
        'dest': join_path(MUSIC_ROOT, artist, album, name),
    }


def metadata_args(fields: dict, current: dict) -> list[str]:
    """ffmpeg -metadata options; an empty value removes the tag.

    An album artist that only repeated the old artist follows the new one,
    so the watch does not keep grouping the track under the old name.
    """
    args = []
    for name in TAG_FIELDS:
        args += ['-metadata', f'{name}={str(fields.get(name) or "").strip()}']
    album_artist = current.get('album_artist', '')
    if album_artist and album_artist == current.get('artist'):
        args += ['-metadata', f'album_artist={str(fields.get("artist") or "").strip()}']
    return args


def probe_command(source: str) -> list[str]:
    return ['ffprobe', '-v', 'error', '-show_entries', 'format_tags:stream_tags', '-of', 'json', source]


def tag_command(source: str, target: str, method: str, metadata: list[str]) -> list[str]:
    """Write tags into a new file. MP3 gets ID3v2.3, the version Garmin reads reliably."""
    head = ['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', source, '-map_metadata', '0']
    if method == 'copy':
        body = ['-map', '0', '-c', 'copy']
    elif method == 'remux':
        body = ['-map', '0:a', '-c', 'copy']
    else:
        body = ['-map', '0:a:0', '-codec:a', 'libmp3lame', '-q:a', '2']
    tail = ['-id3v2_version', '3'] if target.endswith('.mp3') else []
    return head + body + metadata + tail + [target]


def same_path(left: str, right: str) -> bool:
    """FAT ignores case, so 'a.mp3' and 'A.mp3' are the same file on the watch."""
    return left.casefold() == right.casefold()


def backup_name(name: str, taken: set[str]) -> str:
    """A free name in the folder for the original while its replacement uploads."""
    folded = {item.casefold() for item in taken}
    for number in range(100):
        candidate = f'{BACKUP_PREFIX}{number or ""}{name}'
        if candidate.casefold() not in folded:
            return candidate
    raise WatchError('Too many leftover retag files in this folder')


def entry_from_tuple(item: tuple) -> dict:
    """One (itemId, parentId, storageId, filename, filesize, modified, filetype) from kmtpd."""
    return {
        'id': int(item[0]),
        'name': str(item[3]),
        'size': int(item[4]),
        'modified': int(item[5]),
        'folder': item[6] == DIRECTORY_TYPE,
    }


def group_tracks(files: list[dict]) -> list[dict]:
    """Group files found under /Music by their artist folder.

    Each file is {'path', 'size'}. Files directly in /Music land in a group
    with an empty path, which the bar shows but cannot delete as a whole.
    """
    artists: dict[str, dict] = {}
    for file in files:
        parts = PurePosixPath(file['path']).relative_to(MUSIC_ROOT).parts
        artist = parts[0] if len(parts) > 1 or file.get('folder') else ''
        group = artists.setdefault(artist, {
            'name': artist,
            'path': join_path(MUSIC_ROOT, artist) if artist else '',
            'size': 0,
            'count': 0,
            'tracks': [],
        })
        if file.get('folder'):
            continue
        name = parts[-1]
        group['tracks'].append({
            'name': name,
            'title': PurePosixPath(name).stem,
            'album': '/'.join(parts[1:-1]),
            'path': file['path'],
            'size': file['size'],
        })
        group['size'] += file['size']
        group['count'] += 1
    for group in artists.values():
        group['tracks'].sort(key=lambda track: (track['album'].casefold(), track['name'].casefold()))
    return sorted(artists.values(), key=lambda group: (group['path'] == '', group['name'].casefold()))


def parse_manifest(text: str, key: str) -> list[dict]:
    """A JSON list of objects that each have `key`; tag fields must be strings."""
    try:
        items = json.loads(text)
    except json.JSONDecodeError as error:
        raise WatchError(f'The manifest is not valid JSON: {error.msg}') from error
    if not isinstance(items, list) or not items:
        raise WatchError('The manifest must be a non-empty JSON list')
    for item in items:
        if not isinstance(item, dict) or not isinstance(item.get(key), str) or not item[key]:
            raise WatchError(f'Every manifest entry needs a "{key}"')
        if any(name in item and not isinstance(item[name], str) for name in TAG_FIELDS):
            raise WatchError('Artist, title and album must be text')
    if key == 'path' and not all(is_deletable(item['path']) for item in items):
        raise WatchError('Only tracks inside /Music can be retagged')
    return items


def parse_retag_args(argv: list[str]) -> list[dict] | str:
    """`PATH --artist A ...` as a one-entry manifest, or the manifest source after --manifest."""
    if len(argv) == 2 and argv[0] == '--manifest':
        return argv[1]
    if not argv or argv[0].startswith('--') or len(argv) % 2 != 1:
        raise WatchError('Usage: retag PATH [--artist A] [--title T] [--album B]')
    item = {'path': argv[0]}
    for flag, value in zip(argv[1::2], argv[2::2]):
        if flag not in ('--artist', '--title', '--album'):
            raise WatchError(f'Unknown option {flag}')
        item[flag[2:]] = value
    return parse_manifest(json.dumps([item]), 'path')


def find_usb_watch(devices: Path | None = None) -> bool:
    for vendor in (devices or USB_DEVICES).glob('*/idVendor'):
        try:
            if vendor.read_text().strip() == GARMIN_VENDOR:
                return True
        except OSError:
            continue
    return False


def is_garmin_udi(udi: str) -> bool:
    sysfs = sysfs_path_from_udi(udi)
    if not sysfs:
        return False
    try:
        return Path(sysfs, 'idVendor').read_text().strip() == GARMIN_VENDOR
    except OSError:
        return False


def offline_status(usb: bool, error: str = '') -> dict:
    return {'connected': False, 'usb': usb, 'name': '', 'storage': '', 'free': 0, 'capacity': 0, 'error': error}


def emit(payload: dict) -> None:
    print(json.dumps(payload), flush=True)


def run(args: list[str], timeout: float = COMMAND_TIMEOUT) -> tuple[int, str, str]:
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    except FileNotFoundError:
        return 127, '', f'{args[0]} is not installed'
    except subprocess.TimeoutExpired:
        return 124, '', f'{args[0]} timed out'
    return result.returncode, result.stdout, result.stderr


def last_line(text: str, fallback: str) -> str:
    lines = [line for line in text.strip().splitlines() if line.strip()]
    return lines[-1].strip() if lines else fallback


def read_probe(source: str) -> dict:
    code, output, error = run(probe_command(source))
    if code != 0:
        raise WatchError(last_line(error, 'ffprobe could not read the file'))
    try:
        return json.loads(output or '{}')
    except json.JSONDecodeError as exc:
        raise WatchError('ffprobe returned unreadable tags') from exc


def write_tags(source: str, target: str, method: str, fields: dict, current: dict) -> None:
    command = tag_command(source, target, method, metadata_args(fields, current))
    code, _, error = run(command, timeout=CONVERT_TIMEOUT)
    if code != 0:
        verb = 'Conversion' if method == 'convert' else 'Writing tags'
        raise WatchError(f'{verb} failed: {last_line(error, "ffmpeg error")}')


def cache_dir() -> Path:
    base = Path(os.environ.get('XDG_CACHE_HOME') or Path.home() / '.cache')
    return base / 'leo' / 'garmin-music'


def prune_cache(now: float | None = None) -> None:
    now = now or time.time()
    for file in cache_dir().glob('*'):
        try:
            if now - file.stat().st_mtime > CACHE_MAX_AGE:
                file.unlink()
        except OSError:
            continue


# kmtpd over D-Bus -----------------------------------------------------------

class Kmtp:
    def __init__(self) -> None:
        import gi
        gi.require_version('Gio', '2.0')
        from gi.repository import Gio, GLib
        self.Gio = Gio
        self.GLib = GLib
        try:
            self.bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
        except GLib.Error as error:
            raise WatchError(f'No session bus: {error.message}') from error

    def call(self, path: str, iface: str, method: str, signature: str = '', args: tuple = (),
             timeout: int = -1):
        GLib = self.GLib
        params = GLib.Variant(f'({signature})', args) if signature else None
        try:
            reply = self.bus.call_sync(KMTPD, path, iface, method, params, None,
                                       self.Gio.DBusCallFlags.NONE, timeout, None)
        except GLib.Error as error:
            raise WatchError(f'kmtpd {method} failed: {error.message}') from error
        return reply.unpack() if reply is not None else ()

    def prop(self, path: str, iface: str, name: str):
        return self.call(path, 'org.freedesktop.DBus.Properties', 'Get', 'ss', (iface, name))[0]

    def find_watch(self) -> tuple[str, str, str] | None:
        """(device, storage, friendly name) for the first Garmin device kmtpd knows."""
        for device in self.call(DAEMON_PATH, DAEMON_IFACE, 'listDevices')[0]:
            if not is_garmin_udi(self.prop(device, DEVICE_IFACE, 'udi')):
                continue
            storages = self.call(device, DEVICE_IFACE, 'listStorages')[0]
            if storages:
                return device, storages[0], self.prop(device, DEVICE_IFACE, 'friendlyName')
        return None

    def status(self) -> dict:
        found = self.find_watch()
        if not found:
            return offline_status(True, 'The watch is plugged in but kmtpd has not opened it yet')
        _, storage, name = found
        return {
            'connected': True,
            'usb': True,
            'name': name or 'Garmin watch',
            'storage': storage,
            'free': self.free_space(storage),
            'capacity': int(self.prop(storage, STORAGE_IFACE, 'maxCapacity')),
            'error': '',
        }

    def free_space(self, storage: str) -> int:
        return int(self.prop(storage, STORAGE_IFACE, 'freeSpaceInBytes'))

    def list_dir(self, storage: str, path: str) -> list[dict]:
        entries, code = self.call(storage, STORAGE_IFACE, 'getFilesAndFolders', 's', (path,))
        if code != 0:
            raise WatchError(f'Could not read {path} on the watch')
        return [entry_from_tuple(item) for item in entries]

    def metadata(self, storage: str, path: str) -> dict | None:
        item = self.call(storage, STORAGE_IFACE, 'getFileMetadata', 's', (path,))[0]
        return entry_from_tuple(item) if item[0] else None

    def child_names(self, storage: str, folder: str) -> set[str]:
        """Names in a folder, or nothing when the folder does not exist yet."""
        entry = self.metadata(storage, folder)
        if not entry or not entry['folder']:
            return set()
        return {child['name'] for child in self.list_dir(storage, folder)}

    def exists(self, storage: str, path: str) -> bool:
        """Case-insensitive, like the watch's FAT storage."""
        parent = str(PurePosixPath(path).parent)
        name = PurePosixPath(path).name
        return any(same_path(child, name) for child in self.child_names(storage, parent))

    def make_folder(self, storage: str, path: str) -> None:
        existing = self.metadata(storage, path)
        if existing:
            if not existing['folder']:
                raise WatchError(f'{path} on the watch is a file, not a folder')
            return
        if not self.call(storage, STORAGE_IFACE, 'createFolder', 's', (path,))[0]:
            raise WatchError(f'Could not create {path} on the watch')

    def delete(self, storage: str, path: str) -> None:
        """Delete a file, or a folder after everything inside it."""
        entry = self.metadata(storage, path)
        if entry is None:
            raise WatchError(f'{path} is not on the watch')
        if entry['folder']:
            for child in self.list_dir(storage, path):
                self.delete(storage, join_path(path, child['name']))
        if self.call(storage, STORAGE_IFACE, 'deleteObject', 's', (path,))[0] != 0:
            raise WatchError(f'The watch refused to delete {PurePosixPath(path).name}')

    def rename(self, storage: str, path: str, name: str) -> None:
        if self.call(storage, STORAGE_IFACE, 'setFileName', 'ss', (path, name))[0] != 0:
            raise WatchError(f'The watch refused to rename {PurePosixPath(path).name}')

    def remove_empty_folders(self, storage: str, folder: str) -> None:
        """Delete a folder left empty by a move, then its parent, up to /Music."""
        while is_deletable(folder):
            if self.metadata(storage, folder) is None or self.list_dir(storage, folder):
                return
            if self.call(storage, STORAGE_IFACE, 'deleteObject', 's', (folder,))[0] != 0:
                return
            folder = str(PurePosixPath(folder).parent)

    def walk(self, storage: str, path: str, depth: int = 0) -> list[dict]:
        found = []
        for entry in self.list_dir(storage, path):
            child = join_path(path, entry['name'])
            found.append({'path': child, 'size': entry['size'], 'folder': entry['folder']})
            if entry['folder'] and depth < MAX_DEPTH:
                try:
                    found.extend(self.walk(storage, child, depth + 1))
                except WatchError:
                    continue  # Deleted while we were listing.
        return found

    def transfer(self, storage: str, method: str, fd: int, path: str, progress) -> None:
        """Send or receive through a file descriptor.

        kmtpd answers 0 at once when the transfer is queued (1 when the path is
        wrong), then signals copyProgress(sent, total) and copyFinished(result).
        """
        Gio, GLib = self.Gio, self.GLib
        loop = GLib.MainLoop()
        state = {'reply': None, 'finished': None, 'error': '', 'active': time.monotonic(), 'timer': 0}

        def settle() -> None:
            started = state['reply'] is not None
            if state['error'] or (started and (state['reply'] != 0 or state['finished'] is not None)):
                loop.quit()

        def on_signal(_bus, _sender, _path, _iface, member, params) -> None:
            state['active'] = time.monotonic()
            if member == 'copyProgress':
                progress(*params.unpack())
            elif member == 'copyFinished':
                state['finished'] = params.unpack()[0]
                settle()

        def on_reply(bus, result) -> None:
            try:
                reply, _ = bus.call_with_unix_fd_list_finish(result)
                state['reply'] = reply.unpack()[0]
            except GLib.Error as error:
                state['error'] = error.message
            settle()

        def watchdog() -> bool:
            if time.monotonic() - state['active'] > STALL_TIMEOUT:
                state['error'] = 'The watch stopped responding'
                state['timer'] = 0
                loop.quit()
                return False
            return True

        subscription = self.bus.signal_subscribe(None, STORAGE_IFACE, None, storage, None,
                                                 Gio.DBusSignalFlags.NONE, on_signal)
        try:
            fds = Gio.UnixFDList.new()
            index = fds.append(fd)
            self.bus.call_with_unix_fd_list(
                KMTPD, storage, STORAGE_IFACE, method,
                GLib.Variant('(hs)', (index, path)), GLib.VariantType('(i)'),
                Gio.DBusCallFlags.NONE, NO_TIMEOUT, fds, None, on_reply)
            state['timer'] = GLib.timeout_add_seconds(5, watchdog)
            loop.run()
        finally:
            if state['timer']:
                GLib.source_remove(state['timer'])
            self.bus.signal_unsubscribe(subscription)

        if state['error']:
            raise WatchError(state['error'])
        if state['reply'] != 0:
            raise WatchError('kmtpd could not start the transfer')
        if state['finished'] != 0:
            raise WatchError('The watch rejected the transfer')

    def send(self, storage: str, source: str, dest: str, progress) -> None:
        fd = os.open(source, os.O_RDONLY)
        try:
            self.transfer(storage, 'sendFileFromFileDescriptor', fd, dest, progress)
        finally:
            os.close(fd)

    def receive(self, storage: str, path: str, target: Path, progress) -> None:
        fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        try:
            self.transfer(storage, 'getFileToFileDescriptor', fd, path, progress)
        finally:
            os.close(fd)

    def discard(self, storage: str, path: str) -> None:
        """Remove a file this script created, after a failed step; never raises."""
        try:
            if self.metadata(storage, path):
                self.delete(storage, path)
        except WatchError:
            pass

    def upload_verified(self, storage: str, source: str, dest: str, progress) -> None:
        """Upload, then check the watch lists the file with the size that was sent."""
        size = os.path.getsize(source)
        self.send(storage, source, dest, progress)
        entry = self.metadata(storage, dest)
        if not entry or entry['folder'] or entry['size'] != size:
            raise WatchError('The upload did not arrive complete')


def connect() -> tuple[Kmtp, dict]:
    if not find_usb_watch():
        raise WatchError('No Garmin watch is connected')
    kmtp = Kmtp()
    status = kmtp.status()
    if not status['connected']:
        raise WatchError(status['error'])
    return kmtp, status


def progress_printer(index: int):
    """Progress events, at most four a second."""
    last = {'time': 0.0}

    def progress(sent: int, total: int) -> None:
        now = time.monotonic()
        if now - last['time'] >= 0.25 or sent >= total:
            last['time'] = now
            emit({'event': 'progress', 'index': index, 'sent': sent, 'total': total})
    return progress


def fetch(kmtp: Kmtp, storage: str, path: str, entry: dict, progress) -> Path:
    """Download a track, or reuse the copy a recent probe-remote left in the cache."""
    folder = cache_dir()
    folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    target = folder / f'{entry["id"]}-{entry["size"]}{PurePosixPath(path).suffix.lower()}'
    if target.is_file() and target.stat().st_size == entry['size']:
        return target
    partial = target.with_name(target.name + '.part')
    try:
        kmtp.receive(storage, path, partial, progress)
        if partial.stat().st_size != entry['size']:
            raise WatchError('The download from the watch was incomplete')
        partial.rename(target)
    finally:
        partial.unlink(missing_ok=True)
    return target


# Commands -------------------------------------------------------------------

def collect_status() -> dict:
    if not find_usb_watch():
        return offline_status(False)
    try:
        return Kmtp().status()
    except WatchError as error:
        return offline_status(True, str(error))


def collect_list() -> dict:
    try:
        kmtp, status = connect()
        files = kmtp.walk(status['storage'], MUSIC_ROOT)
    except WatchError as error:
        return {'ok': False, 'error': str(error), 'device': collect_status(), 'artists': []}
    return {'ok': True, 'error': '', 'device': status, 'artists': group_tracks(files)}


def probe_local(source: str) -> dict:
    name = os.path.basename(source)
    result = {'source': source, 'name': name, 'ok': False, 'error': '', 'from': '', 'to': '',
              'size': 0, 'tags': {}, 'fields': prefill({}, name)}
    try:
        if not os.path.isfile(source):
            raise WatchError('File not found')
        target = output_format(name)
        if target is None:
            raise WatchError(f'{PurePosixPath(name).suffix or "This format"} is not supported')
        tags = read_tags(read_probe(source))
    except WatchError as error:
        result['error'] = str(error)
        return result
    result.update({
        'ok': True,
        'from': PurePosixPath(name).suffix.lstrip('.').upper(),
        'to': target[0].lstrip('.').upper(),
        'size': os.path.getsize(source),
        'tags': tags,
        'fields': prefill(tags, name),
    })
    return result


def probe_remote(path: str) -> int:
    """Download a track to read its tags; the copy stays cached for a retag."""
    prune_cache()
    name = PurePosixPath(path).name
    try:
        if not is_deletable(path) or output_format(name) is None or output_format(name)[1] == 'convert':
            raise WatchError('Only MP3, M4A and AAC tracks inside /Music can be edited')
        kmtp, status = connect()
        entry = kmtp.metadata(status['storage'], path)
        if not entry or entry['folder']:
            raise WatchError(f'{name} is not on the watch')
        local = fetch(kmtp, status['storage'], path, entry, progress_printer(0))
        tags = read_tags(read_probe(str(local)))
    except WatchError as error:
        emit({'event': 'result', 'ok': False, 'error': str(error), 'path': path})
        return 1
    emit({'event': 'result', 'ok': True, 'error': '', 'path': path, 'name': name,
          'tags': tags, 'fields': prefill(tags, name, folder_guess(path))})
    return 0


def add_file(kmtp: Kmtp, storage: str, index: int, item: dict, workdir: str) -> str:
    """Tag a copy of one file and upload it. Returns 'done' or 'skipped'."""
    source = item['source']
    name = os.path.basename(source)
    if not os.path.isfile(source):
        raise WatchError('File not found')
    target = output_format(name)
    if target is None:
        raise WatchError(f'{PurePosixPath(name).suffix or "This format"} is not supported')
    extension, method = target
    current = read_tags(read_probe(source))
    fields = prefill(current, name)
    fields.update({key: item[key] for key in TAG_FIELDS if key in item})
    plan = track_path(fields, extension)
    emit({'event': 'file', 'index': index, 'name': plan['name'], 'dest': plan['dest']})

    if kmtp.exists(storage, plan['dest']):
        emit({'event': 'skipped', 'index': index, 'name': plan['name'], 'reason': 'Already on the watch'})
        return 'skipped'

    emit({'event': 'phase', 'index': index, 'phase': 'converting' if method == 'convert' else 'tagging'})
    upload = os.path.join(workdir, f'{index}{extension}')
    write_tags(source, upload, method, fields, current)
    if os.path.getsize(upload) >= kmtp.free_space(storage):
        raise WatchError('Not enough space on the watch')

    for folder in plan['folders']:
        kmtp.make_folder(storage, folder)
    emit({'event': 'phase', 'index': index, 'phase': 'uploading'})
    try:
        kmtp.upload_verified(storage, upload, plan['dest'], progress_printer(index))
    except WatchError:
        # Nothing was there before, so whatever arrived is ours to remove.
        kmtp.discard(storage, plan['dest'])
        raise
    emit({'event': 'done', 'index': index, 'name': plan['name'], 'dest': plan['dest']})
    return 'done'


def replace_in_place(kmtp: Kmtp, storage: str, path: str, upload: str, dest: str, progress) -> None:
    """Same path (maybe a different case): move the original aside, upload, then drop it.

    The original is only renamed until the replacement is verified, and is
    renamed back if the upload fails.
    """
    folder = str(PurePosixPath(path).parent)
    original = PurePosixPath(path).name
    backup = backup_name(original, kmtp.child_names(storage, folder))
    kmtp.rename(storage, path, backup)
    backup_path = join_path(folder, backup)
    try:
        kmtp.upload_verified(storage, upload, dest, progress)
    except WatchError as error:
        kmtp.discard(storage, dest)
        try:
            kmtp.rename(storage, backup_path, original)
        except WatchError:
            raise WatchError(f'{error}. The original is kept as {backup}') from error
        raise
    try:
        kmtp.delete(storage, backup_path)
    except WatchError as error:
        raise WatchError(f'Updated, but the old copy is left as {backup}') from error


def move_to(kmtp: Kmtp, storage: str, path: str, upload: str, plan: dict, progress) -> None:
    """New path: upload the retagged copy, verify it, then delete the original."""
    if kmtp.exists(storage, plan['dest']):
        raise WatchError(f'{plan["dest"][len(MUSIC_ROOT) + 1:]} is already on the watch')
    if os.path.getsize(upload) >= kmtp.free_space(storage):
        raise WatchError('Not enough space on the watch')
    for folder in plan['folders']:
        kmtp.make_folder(storage, folder)
    try:
        kmtp.upload_verified(storage, upload, plan['dest'], progress)
    except WatchError:
        kmtp.discard(storage, plan['dest'])
        raise
    try:
        kmtp.delete(storage, path)
    except WatchError as error:
        raise WatchError('Saved the updated copy, but could not delete the old file') from error
    kmtp.remove_empty_folders(storage, str(PurePosixPath(path).parent))


def retag_file(kmtp: Kmtp, storage: str, index: int, item: dict, workdir: str) -> None:
    path = item['path']
    name = PurePosixPath(path).name
    emit({'event': 'file', 'index': index, 'name': name, 'dest': path})
    target = output_format(name)
    if target is None or target[1] == 'convert':
        raise WatchError('Only MP3, M4A and AAC tracks can be retagged')
    extension, method = target
    entry = kmtp.metadata(storage, path)
    if not entry or entry['folder']:
        raise WatchError('The track is no longer on the watch')

    emit({'event': 'phase', 'index': index, 'phase': 'downloading'})
    local = fetch(kmtp, storage, path, entry, progress_printer(index))
    current = read_tags(read_probe(str(local)))
    fields = prefill(current, name, folder_guess(path))
    fields.update({key: item[key] for key in TAG_FIELDS if key in item})

    emit({'event': 'phase', 'index': index, 'phase': 'tagging'})
    upload = os.path.join(workdir, f'{index}{extension}')
    write_tags(str(local), upload, method, fields, current)
    plan = track_path(fields, extension)

    emit({'event': 'phase', 'index': index, 'phase': 'uploading'})
    progress = progress_printer(index)
    if same_path(plan['dest'], path):
        replace_in_place(kmtp, storage, path, upload, plan['dest'], progress)
    else:
        move_to(kmtp, storage, path, upload, plan, progress)
    local.unlink(missing_ok=True)
    emit({'event': 'done', 'index': index, 'name': plan['name'], 'dest': plan['dest']})


def run_batch(items: list[dict], work) -> int:
    """Run `work` for each item, printing start, per-file and finished events."""
    counts = {'done': 0, 'skipped': 0, 'failed': 0}
    emit({'event': 'start', 'total': len(items)})
    try:
        kmtp, status = connect()
    except WatchError as error:
        emit({'event': 'failed', 'index': -1, 'name': '', 'error': str(error)})
        emit({'event': 'finished', 'done': 0, 'skipped': 0, 'failed': len(items)})
        return 1

    with tempfile.TemporaryDirectory(prefix='garmin-music-') as workdir:
        for index, item in enumerate(items):
            label = os.path.basename(item.get('source') or item.get('path') or '')
            try:
                counts[work(kmtp, status['storage'], index, item, workdir) or 'done'] += 1
            except WatchError as error:
                counts['failed'] += 1
                emit({'event': 'failed', 'index': index, 'name': label, 'error': str(error)})
            finally:
                for leftover in Path(workdir).iterdir():
                    leftover.unlink(missing_ok=True)

    emit({'event': 'finished', **counts})
    return 1 if counts['failed'] else 0


def read_manifest(source: str, key: str) -> list[dict]:
    if source == '-':
        text = sys.stdin.readline()
    else:
        try:
            text = Path(source).read_text()
        except OSError as error:
            raise WatchError(f'Could not read {source}: {error.strerror}') from error
    return parse_manifest(text, key)


def batch_error(error: WatchError) -> int:
    emit({'event': 'start', 'total': 0})
    emit({'event': 'failed', 'index': -1, 'name': '', 'error': str(error)})
    emit({'event': 'finished', 'done': 0, 'skipped': 0, 'failed': 1})
    return 1


def add_command(argv: list[str]) -> int:
    try:
        if argv[0] == '--manifest' and len(argv) == 2:
            items = read_manifest(argv[1], 'source')
        else:
            items = [{'source': source} for source in argv]
    except WatchError as error:
        return batch_error(error)
    return run_batch(items, add_file)


def retag_command(argv: list[str]) -> int:
    prune_cache()
    try:
        parsed = parse_retag_args(argv)
        items = read_manifest(parsed, 'path') if isinstance(parsed, str) else parsed
    except WatchError as error:
        return batch_error(error)
    return run_batch(items, retag_file)


def remove(path: str) -> int:
    if not is_deletable(path):
        emit({'ok': False, 'error': 'Only tracks and folders inside /Music can be deleted'})
        return 1
    try:
        kmtp, status = connect()
        kmtp.delete(status['storage'], path)
    except WatchError as error:
        emit({'ok': False, 'error': str(error)})
        return 1
    emit({'ok': True, 'error': ''})
    return 0


def watch() -> int:
    """Print status when the watch is plugged, unplugged or kmtpd restarts.

    udev events catch the USB side; kmtpd's devicesChanged and its bus name
    catch the moment it opens or drops the device. Nothing polls.
    """
    import gi
    gi.require_version('Gio', '2.0')
    from gi.repository import Gio, GLib

    loop = GLib.MainLoop()
    bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
    state = {'last': '', 'timer': 0, 'retries': 0}

    def refresh() -> bool:
        state['timer'] = 0
        status = collect_status()
        line = json.dumps(status)
        if line != state['last']:
            state['last'] = line
            print(line, flush=True)
        # kmtpd takes a moment to open a newly plugged watch and may not
        # announce it; look again a few times.
        if status['usb'] and not status['connected'] and state['retries'] < 10:
            state['retries'] += 1
            schedule(2000, retry=True)
        return False

    def schedule(delay: int, retry: bool = False) -> None:
        if not retry:
            state['retries'] = 0
        if state['timer']:
            GLib.source_remove(state['timer'])
        state['timer'] = GLib.timeout_add(delay, refresh)

    bus.signal_subscribe(None, DAEMON_IFACE, 'devicesChanged', DAEMON_PATH, None,
                         Gio.DBusSignalFlags.NONE, lambda *_: schedule(300))
    bus.signal_subscribe('org.freedesktop.DBus', 'org.freedesktop.DBus', 'NameOwnerChanged',
                         '/org/freedesktop/DBus', KMTPD, Gio.DBusSignalFlags.NONE,
                         lambda *_: schedule(1000))

    try:
        gi.require_version('GUdev', '1.0')
        from gi.repository import GUdev

        def on_uevent(_client, action, device) -> None:
            if device.get_devtype() != 'usb_device' or action not in ('add', 'remove'):
                return
            product = device.get_property('PRODUCT') or ''
            if product.split('/')[0].rjust(4, '0') == GARMIN_VENDOR:
                schedule(1000)

        udev = GUdev.Client.new(['usb'])
        udev.connect('uevent', on_uevent)
    except (ImportError, ValueError):
        udev = None  # Without GUdev, kmtpd's own signals still report changes.

    refresh()
    try:
        loop.run()
    except KeyboardInterrupt:
        pass
    return 0


def main(argv: list[str]) -> int:
    command = argv[0] if argv else 'status'
    args = argv[1:]
    if command == 'status' and not args:
        emit(collect_status())
        return 0
    if command == 'watch' and not args:
        return watch()
    if command == 'list' and not args:
        payload = collect_list()
        emit(payload)
        return 0 if payload['ok'] else 1
    if command == 'probe' and args:
        emit({'files': [probe_local(source) for source in args]})
        return 0
    if command == 'probe-remote' and len(args) == 1:
        return probe_remote(args[0])
    if command == 'add' and args:
        return add_command(args)
    if command == 'retag' and args:
        return retag_command(args)
    if command == 'rm' and len(args) == 1:
        return remove(args[0])
    print(__doc__.strip(), file=sys.stderr)
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
