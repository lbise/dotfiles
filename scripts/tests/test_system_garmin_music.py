#!/usr/bin/env python3

import contextlib
import hashlib
import importlib.util
import io
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path, PurePosixPath
from unittest import mock

SCRIPT = Path(__file__).resolve().parents[1] / 'system' / 'system-garmin-music.py'
spec = importlib.util.spec_from_file_location('system_garmin_music', SCRIPT)
garmin = importlib.util.module_from_spec(spec)
spec.loader.exec_module(garmin)

HAS_FFMPEG = bool(shutil.which('ffmpeg') and shutil.which('ffprobe'))


def capture(function, *args):
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        code = function(*args)
    return code, [json.loads(line) for line in out.getvalue().splitlines()]


class NameTest(unittest.TestCase):
    def test_udi_maps_to_sysfs(self) -> None:
        udi = '/org/kde/solid/udev/sys/devices/pci0000:00/0000:0e:00.0/usb1/1-2'
        self.assertEqual(garmin.sysfs_path_from_udi(udi), '/sys/devices/pci0000:00/0000:0e:00.0/usb1/1-2')
        self.assertIsNone(garmin.sysfs_path_from_udi('/org/kde/fstab/home'))

    def test_safe_name_drops_characters_fat_rejects(self) -> None:
        self.assertEqual(garmin.safe_name('AC/DC: Live?', 'x'), 'AC_DC_ Live_')
        self.assertEqual(garmin.safe_name('a\\b*c"d<e>f|g', 'x'), 'a_b_c_d_e_f_g')
        self.assertEqual(garmin.safe_name('  Sigma  feat.  ', 'x'), 'Sigma feat')
        self.assertEqual(garmin.safe_name('...', 'Unknown Artist'), 'Unknown Artist')
        self.assertEqual(garmin.safe_name('', 'Unknown'), 'Unknown')
        self.assertEqual(len(garmin.safe_name('a' * 300, 'x')), 120)

    def test_join_path_ignores_empty_parts(self) -> None:
        self.assertEqual(garmin.join_path('/Music', 'Netsky', '', 'Unknown/'), '/Music/Netsky/Unknown')

    def test_only_paths_inside_music_are_deletable(self) -> None:
        self.assertTrue(garmin.is_deletable('/Music/Netsky'))
        self.assertTrue(garmin.is_deletable('/Music/Netsky/Unknown/mix.mp3'))
        for path in ('/Music', '/Music/', '/GARMIN/Apps', '/Music/../GARMIN', '/Music/./x', 'Music/x', '/Musical/x'):
            self.assertFalse(garmin.is_deletable(path), path)

    def test_fat_paths_compare_without_case(self) -> None:
        self.assertTrue(garmin.same_path('/Music/A/Unknown/tone.mp3', '/Music/a/unknown/Tone.MP3'))
        self.assertFalse(garmin.same_path('/Music/A/x.mp3', '/Music/B/x.mp3'))

    def test_backup_name_avoids_names_in_the_folder(self) -> None:
        self.assertEqual(garmin.backup_name('a.mp3', {'a.mp3'}), '__retag__a.mp3')
        self.assertEqual(garmin.backup_name('a.mp3', {'a.mp3', '__RETAG__a.mp3'}), '__retag__1a.mp3')


class GuessTest(unittest.TestCase):
    def guess(self, stem: str) -> tuple[str, str]:
        result = garmin.guess_from_filename(stem)
        return result['artist'], result['title']

    def test_artist_and_title(self) -> None:
        self.assertEqual(self.guess('Daft Punk - One More Time'), ('Daft Punk', 'One More Time'))
        self.assertEqual(self.guess('Artist \u2013 Song'), ('Artist', 'Song'))

    def test_track_numbers(self) -> None:
        self.assertEqual(self.guess('01 - Title Only'), ('', 'Title Only'))
        self.assertEqual(self.guess('01. Some Artist - Some Song'), ('Some Artist', 'Some Song'))
        self.assertEqual(self.guess('07) Artist - Song'), ('Artist', 'Song'))
        # Not track numbers: a leading count or year belongs to the name.
        self.assertEqual(self.guess('15 years of rampage'), ('', '15 years of rampage'))

    def test_trailing_junk(self) -> None:
        self.assertEqual(self.guess('Daft Punk - One More Time (Official Audio)'), ('Daft Punk', 'One More Time'))
        self.assertEqual(self.guess('Artist - Song [HD] (320kbps)'), ('Artist', 'Song'))
        self.assertEqual(self.guess('kanine - live @ london troxy 2024 [ ezmp3.cc ]'),
                         ('kanine', 'live @ london troxy 2024'))
        self.assertEqual(self.guess('y2mate.is - hello 2021 maduk-i9kkblvabze-160k-1645045780747'),
                         ('', 'hello 2021 maduk'))
        self.assertEqual(self.guess('a - b-lfqud_8t4qe-160k-1645341218485'), ('a', 'b'))
        self.assertEqual(self.guess('[ythub.cc] hybrid minds essential mix-192k'), ('', 'hybrid minds essential mix'))

    def test_underscores_and_long_ids(self) -> None:
        self.assertEqual(self.guess('maduk_dj_set_livestream_7036734752027693239'), ('', 'maduk dj set livestream'))
        self.assertEqual(self.guess('netsky_mix_-7500864057333045320'), ('', 'netsky mix'))

    def test_real_names_are_left_alone(self) -> None:
        self.assertEqual(self.guess('Mr.Oizo - Flat Beat'), ('Mr.Oizo', 'Flat Beat'))
        self.assertEqual(self.guess('Live at Rampage [2017.05.06]'), ('', 'Live at Rampage [2017.05.06]'))
        self.assertEqual(self.guess('Song (Remix)'), ('', 'Song (Remix)'))

    def test_folder_guess_skips_fillers(self) -> None:
        self.assertEqual(garmin.folder_guess('/Music/Netsky/Unknown/a.mp3'), {'artist': 'Netsky', 'album': ''})
        self.assertEqual(garmin.folder_guess('/Music/Kanine/Mixes/a.mp3'), {'artist': 'Kanine', 'album': 'Mixes'})
        self.assertEqual(garmin.folder_guess('/Music/Unknown Artist/x.mp3'), {'artist': '', 'album': ''})
        self.assertEqual(garmin.folder_guess('/Music/a.mp3'), {'artist': '', 'album': ''})

    def test_prefill_order_is_tags_then_folders_then_filename(self) -> None:
        name = 'Guess Artist - Guess Title.mp3'
        self.assertEqual(garmin.prefill({}, name), {'artist': 'Guess Artist', 'title': 'Guess Title', 'album': ''})
        self.assertEqual(garmin.prefill({}, name, {'artist': 'Folder', 'album': 'Mixes'}),
                         {'artist': 'Folder', 'title': 'Guess Title', 'album': 'Mixes'})
        tags = {'artist': 'Tag', 'title': 'Tagged', 'album': 'LP'}
        self.assertEqual(garmin.prefill(tags, name, {'artist': 'Folder', 'album': 'Mixes'}), tags)
        self.assertEqual(garmin.prefill({'album_artist': 'Band'}, 'x.mp3')['artist'], 'Band')
        self.assertEqual(garmin.prefill({}, '(Official Video).mp3')['title'], '(Official Video)')


class PlanTest(unittest.TestCase):
    def test_output_format(self) -> None:
        self.assertEqual(garmin.output_format('a.MP3'), ('.mp3', 'copy'))
        self.assertEqual(garmin.output_format('a.m4a'), ('.m4a', 'copy'))
        self.assertEqual(garmin.output_format('a.aac'), ('.m4a', 'remux'))
        for name in ('a.flac', 'a.ogg', 'a.oga', 'a.opus', 'a.WAV'):
            self.assertEqual(garmin.output_format(name), ('.mp3', 'convert'), name)
        self.assertIsNone(garmin.output_format('cover.jpg'))
        self.assertIsNone(garmin.output_format('noext'))

    def test_path_follows_tags(self) -> None:
        plan = garmin.track_path({'artist': 'AC/DC', 'title': 'Back: In Black?', 'album': ''}, '.mp3')
        self.assertEqual(plan['dest'], '/Music/AC_DC/Unknown/Back_ In Black_.mp3')
        self.assertEqual(plan['folders'], ['/Music/AC_DC', '/Music/AC_DC/Unknown'])
        self.assertEqual(garmin.track_path({}, '.m4a')['dest'], '/Music/Unknown Artist/Unknown/Track.m4a')
        self.assertEqual(len(garmin.track_path({'title': 'x' * 300}, '.mp3')['name']), 104)

    def test_metadata_args_write_or_clear_each_field(self) -> None:
        args = garmin.metadata_args({'artist': ' Sota ', 'title': 'Live', 'album': ''}, {})
        self.assertEqual(args, ['-metadata', 'artist=Sota', '-metadata', 'title=Live', '-metadata', 'album='])

    def test_album_artist_follows_only_when_it_repeated_the_artist(self) -> None:
        fields = {'artist': 'New', 'title': 't', 'album': 'a'}
        follows = garmin.metadata_args(fields, {'artist': 'Old', 'album_artist': 'Old'})
        self.assertEqual(follows[-2:], ['-metadata', 'album_artist=New'])
        kept = garmin.metadata_args(fields, {'artist': 'Old', 'album_artist': 'Various Artists'})
        self.assertNotIn('album_artist=New', kept)

    def test_tag_commands(self) -> None:
        meta = ['-metadata', 'title=x']
        copy = garmin.tag_command('in.mp3', 'out.mp3', 'copy', meta)
        self.assertEqual(copy[copy.index('-c') + 1], 'copy')
        self.assertEqual(copy[-3:], ['-id3v2_version', '3', 'out.mp3'])
        m4a = garmin.tag_command('in.m4a', 'out.m4a', 'copy', meta)
        self.assertNotIn('-id3v2_version', m4a)
        remux = garmin.tag_command('in.aac', 'out.m4a', 'remux', meta)
        self.assertEqual(remux[remux.index('-map') + 1], '0:a')
        convert = garmin.tag_command('in.flac', 'out.mp3', 'convert', meta)
        self.assertIn('libmp3lame', convert)
        self.assertEqual(convert[convert.index('-q:a') + 1], '2')
        self.assertIn('title=x', convert)


class ManifestTest(unittest.TestCase):
    def test_valid_manifests(self) -> None:
        items = garmin.parse_manifest('[{"source": "/a.mp3", "artist": "A"}]', 'source')
        self.assertEqual(items, [{'source': '/a.mp3', 'artist': 'A'}])
        self.assertEqual(garmin.parse_manifest('[{"path": "/Music/A/x.mp3"}]', 'path')[0]['path'], '/Music/A/x.mp3')

    def test_invalid_manifests(self) -> None:
        for text, key in (('nope', 'source'), ('[]', 'source'), ('{"source": "x"}', 'source'),
                          ('[{"artist": "A"}]', 'source'), ('[{"source": "/a", "title": 3}]', 'source'),
                          ('[{"path": "/GARMIN/x.mp3"}]', 'path')):
            with self.assertRaises(garmin.WatchError, msg=text):
                garmin.parse_manifest(text, key)

    def test_retag_arguments(self) -> None:
        self.assertEqual(garmin.parse_retag_args(['--manifest', '-']), '-')
        self.assertEqual(garmin.parse_retag_args(['/Music/A/U/x.mp3', '--title', 'T', '--album', '']),
                         [{'path': '/Music/A/U/x.mp3', 'title': 'T', 'album': ''}])
        for argv in ([], ['--artist', 'A'], ['/Music/x.mp3', '--artist'], ['/Music/x.mp3', '--genre', 'g'],
                     ['/GARMIN/x.mp3', '--title', 'T']):
            with self.assertRaises(garmin.WatchError, msg=argv):
                garmin.parse_retag_args(argv)

    def test_old_cache_files_are_pruned(self) -> None:
        with tempfile.TemporaryDirectory() as root, mock.patch.dict(os.environ, {'XDG_CACHE_HOME': root}):
            folder = garmin.cache_dir()
            folder.mkdir(parents=True)
            old, new = folder / '1-10.mp3', folder / '2-10.mp3'
            old.write_text('x')
            new.write_text('x')
            os.utime(old, (0, 0))
            garmin.prune_cache()
            self.assertEqual(sorted(p.name for p in folder.iterdir()), ['2-10.mp3'])


class ListingTest(unittest.TestCase):
    def test_entry_from_kmtpd_tuple(self) -> None:
        item = (16777335, 16777218, 131073, 'Netsky', 0, 1642935962, 'inode/directory')
        self.assertEqual(garmin.entry_from_tuple(item),
                         {'id': 16777335, 'name': 'Netsky', 'size': 0, 'modified': 1642935962, 'folder': True})

    def test_tracks_are_grouped_by_artist_folder(self) -> None:
        files = [
            {'path': '/Music/Sota', 'size': 0, 'folder': True},
            {'path': '/Music/Sota/Unknown', 'size': 0, 'folder': True},
            {'path': '/Music/Sota/Unknown/b.mp3', 'size': 20},
            {'path': '/Music/Sota/Live/a.mp3', 'size': 10},
            {'path': '/Music/bou', 'size': 0, 'folder': True},
            {'path': '/Music/loose.mp3', 'size': 5},
            {'path': '/Music/Kanine/c.mp3', 'size': 7},
        ]
        groups = garmin.group_tracks(files)
        self.assertEqual([g['name'] for g in groups], ['bou', 'Kanine', 'Sota', ''])
        sota = groups[2]
        self.assertEqual((sota['path'], sota['count'], sota['size']), ('/Music/Sota', 2, 30))
        self.assertEqual([(t['album'], t['title']) for t in sota['tracks']], [('Live', 'a'), ('Unknown', 'b')])
        self.assertEqual(groups[0]['count'], 0)
        self.assertEqual(groups[1]['tracks'][0]['album'], '')
        self.assertEqual((groups[3]['path'], groups[3]['tracks'][0]['path']), ('', '/Music/loose.mp3'))

    def test_usb_watch_is_found_by_vendor(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            devices = Path(root)
            (devices / '1-1').mkdir()
            (devices / '1-1' / 'idVendor').write_text('046d\n')
            self.assertFalse(garmin.find_usb_watch(devices))
            (devices / '1-2').mkdir()
            (devices / '1-2' / 'idVendor').write_text('091e\n')
            self.assertTrue(garmin.find_usb_watch(devices))


class FakeWatch(garmin.Kmtp):
    """kmtpd's storage as a dict of path -> entry, with switchable failures."""

    def __init__(self, files: dict[str, int]) -> None:
        self.entries = {'/Music': {'folder': True, 'size': 0}}
        for path, size in files.items():
            self.add(path, size)
        self.fail_send = False
        self.fail_delete: set[str] = set()
        self.fail_rename = False
        self.log: list[str] = []

    def add(self, path: str, size: int, folder: bool = False) -> None:
        for parent in list(PurePosixPath(path).parents)[:-1]:
            self.entries.setdefault(str(parent), {'folder': True, 'size': 0})
        self.entries[path] = {'folder': folder, 'size': size}

    def metadata(self, storage, path):
        entry = self.entries.get(path)
        return dict(entry, id=1, name=PurePosixPath(path).name, modified=0) if entry else None

    def list_dir(self, storage, path):
        if path not in self.entries:
            raise garmin.WatchError('missing')
        return [self.metadata(storage, child) for child in self.entries if str(PurePosixPath(child).parent) == path
                and child != path]

    def call(self, path, iface, method, signature='', args=()):
        assert method == 'deleteObject', method
        self.log.append(f'rmdir {args[0]}')
        del self.entries[args[0]]
        return (0,)

    def free_space(self, storage):
        return 10**9

    def make_folder(self, storage, path):
        self.entries.setdefault(path, {'folder': True, 'size': 0})

    def delete(self, storage, path):
        if path in self.fail_delete:
            raise garmin.WatchError('refused')
        self.log.append(f'delete {path}')
        del self.entries[path]

    def rename(self, storage, path, name):
        if self.fail_rename:
            raise garmin.WatchError('refused')
        target = str(PurePosixPath(path).parent / name)
        self.log.append(f'rename {path} -> {name}')
        self.entries[target] = self.entries.pop(path)

    def send(self, storage, source, dest, progress):
        self.log.append(f'send {dest}')
        self.entries[dest] = {'folder': False, 'size': 1 if self.fail_send else os.path.getsize(source)}
        if self.fail_send:
            raise garmin.WatchError('cable pulled')


class ReplaceTest(unittest.TestCase):
    ORIGINAL = '/Music/Old/Unknown/tone.mp3'

    def setUp(self) -> None:
        handle, self.upload = tempfile.mkstemp()
        os.write(handle, b'x' * 50)
        os.close(handle)
        self.addCleanup(os.unlink, self.upload)
        self.watch = FakeWatch({self.ORIGINAL: 40, '/Music/Other/Unknown/keep.mp3': 9})
        self.plan = garmin.track_path({'artist': 'New', 'title': 'Tone', 'album': 'LP'}, '.mp3')

    def move(self) -> None:
        garmin.move_to(self.watch, 's', self.ORIGINAL, self.upload, self.plan, lambda *_: None)

    def test_move_uploads_then_deletes_and_drops_empty_folders(self) -> None:
        self.move()
        self.assertEqual(self.watch.entries['/Music/New/LP/Tone.mp3']['size'], 50)
        for gone in (self.ORIGINAL, '/Music/Old/Unknown', '/Music/Old'):
            self.assertNotIn(gone, self.watch.entries)
        self.assertIn('/Music/Other/Unknown/keep.mp3', self.watch.entries)
        self.assertLess(self.watch.log.index('send /Music/New/LP/Tone.mp3'),
                        self.watch.log.index(f'delete {self.ORIGINAL}'))

    def test_failed_upload_keeps_the_original_and_removes_the_partial_copy(self) -> None:
        self.watch.fail_send = True
        with self.assertRaises(garmin.WatchError):
            self.move()
        self.assertEqual(self.watch.entries[self.ORIGINAL]['size'], 40)
        self.assertNotIn('/Music/New/LP/Tone.mp3', self.watch.entries)

    def test_failed_delete_of_original_is_reported(self) -> None:
        self.watch.fail_delete = {self.ORIGINAL}
        with self.assertRaisesRegex(garmin.WatchError, 'could not delete the old file'):
            self.move()
        self.assertIn(self.ORIGINAL, self.watch.entries)
        self.assertIn('/Music/New/LP/Tone.mp3', self.watch.entries)

    def test_existing_destination_is_never_overwritten(self) -> None:
        self.watch.add('/Music/New/LP/TONE.mp3', 7)
        with self.assertRaisesRegex(garmin.WatchError, 'already on the watch'):
            self.move()
        self.assertEqual(self.watch.entries['/Music/New/LP/TONE.mp3']['size'], 7)
        self.assertEqual(self.watch.log, [])

    def replace(self, dest: str) -> None:
        garmin.replace_in_place(self.watch, 's', self.ORIGINAL, self.upload, dest, lambda *_: None)

    def test_in_place_moves_the_original_aside_until_the_copy_is_verified(self) -> None:
        self.replace('/Music/Old/Unknown/Tone.mp3')
        self.assertEqual(self.watch.log, [
            'rename /Music/Old/Unknown/tone.mp3 -> __retag__tone.mp3',
            'send /Music/Old/Unknown/Tone.mp3',
            'delete /Music/Old/Unknown/__retag__tone.mp3',
        ])
        self.assertEqual(self.watch.entries['/Music/Old/Unknown/Tone.mp3']['size'], 50)
        self.assertNotIn(self.ORIGINAL, self.watch.entries)

    def test_in_place_failure_restores_the_original(self) -> None:
        self.watch.fail_send = True
        with self.assertRaisesRegex(garmin.WatchError, 'cable pulled'):
            self.replace(self.ORIGINAL)
        self.assertEqual(self.watch.entries[self.ORIGINAL]['size'], 40)
        self.assertEqual([p for p in self.watch.entries if 'retag' in p], [])

    def test_in_place_rename_failure_changes_nothing(self) -> None:
        self.watch.fail_rename = True
        with self.assertRaises(garmin.WatchError):
            self.replace(self.ORIGINAL)
        self.assertEqual(self.watch.entries[self.ORIGINAL]['size'], 40)
        self.assertEqual(self.watch.log, [])

    def test_empty_folder_clean_up_stops_at_music(self) -> None:
        watch = FakeWatch({})
        watch.add('/Music/A/B', 0, folder=True)
        watch.remove_empty_folders('s', '/Music/A/B')
        self.assertEqual(list(watch.entries), ['/Music'])


class CommandTest(unittest.TestCase):
    def setUp(self) -> None:
        self.empty = tempfile.TemporaryDirectory()
        self.addCleanup(self.empty.cleanup)
        patcher = mock.patch.object(garmin, 'USB_DEVICES', Path(self.empty.name))
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_status_without_watch_is_offline(self) -> None:
        code, lines = capture(garmin.main, ['status'])
        self.assertEqual(code, 0)
        self.assertEqual(lines, [garmin.offline_status(False)])

    def test_add_without_watch_reports_every_file_failed(self) -> None:
        code, lines = capture(garmin.main, ['add', '/tmp/a.mp3', '/tmp/b.flac'])
        self.assertEqual(code, 1)
        self.assertEqual([line['event'] for line in lines], ['start', 'failed', 'finished'])
        self.assertEqual(lines[1]['error'], 'No Garmin watch is connected')
        self.assertEqual(lines[2], {'event': 'finished', 'done': 0, 'skipped': 0, 'failed': 2})

    def test_add_reads_a_manifest_from_stdin(self) -> None:
        manifest = io.StringIO(json.dumps([{'source': '/tmp/a.mp3', 'artist': 'A', 'title': 'T', 'album': ''}]) + '\n')
        with mock.patch.object(garmin.sys, 'stdin', manifest):
            code, lines = capture(garmin.main, ['add', '--manifest', '-'])
        self.assertEqual((code, lines[0]), (1, {'event': 'start', 'total': 1}))

    def test_bad_retag_request_is_one_failed_event(self) -> None:
        code, lines = capture(garmin.main, ['retag', '/GARMIN/x.mp3', '--title', 'T'])
        self.assertEqual(code, 1)
        self.assertEqual([line['event'] for line in lines], ['start', 'failed', 'finished'])

    def test_rm_refuses_paths_outside_music_before_touching_the_watch(self) -> None:
        with mock.patch.object(garmin, 'connect') as connect:
            code, lines = capture(garmin.main, ['rm', '/GARMIN/Apps'])
        connect.assert_not_called()
        self.assertEqual(code, 1)
        self.assertFalse(lines[0]['ok'])

    def test_probe_remote_refuses_files_outside_music(self) -> None:
        with mock.patch.object(garmin, 'connect') as connect:
            code, lines = capture(garmin.main, ['probe-remote', '/GARMIN/Apps/x.mp3'])
        connect.assert_not_called()
        self.assertEqual((code, lines[0]['event'], lines[0]['ok']), (1, 'result', False))

    def test_list_without_watch_is_an_error(self) -> None:
        code, lines = capture(garmin.main, ['list'])
        self.assertEqual(code, 1)
        self.assertEqual((lines[0]['ok'], lines[0]['artists']), (False, []))

    def test_unknown_command_prints_usage(self) -> None:
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(garmin.main(['explode']), 2)
            self.assertEqual(garmin.main(['add']), 2)
            self.assertEqual(garmin.main(['probe']), 2)


@unittest.skipUnless(HAS_FFMPEG, 'ffmpeg is not installed')
class FfmpegTest(unittest.TestCase):
    def setUp(self) -> None:
        self.root = tempfile.TemporaryDirectory()
        self.addCleanup(self.root.cleanup)

    def make(self, name: str, *options: str) -> str:
        path = f'{self.root.name}/{name}'
        subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'sine=duration=0.3', *options, path], check=True)
        return path

    def tags(self, path: str) -> dict:
        return garmin.read_tags(garmin.read_probe(path))

    def test_probe_prefills_from_the_filename_when_untagged(self) -> None:
        source = self.make('01. Some Artist - Some Song (Official Video).mp3')
        result = garmin.probe_local(source)
        self.assertTrue(result['ok'], result['error'])
        self.assertEqual(result['fields'], {'artist': 'Some Artist', 'title': 'Some Song', 'album': ''})
        self.assertEqual((result['from'], result['to']), ('MP3', 'MP3'))

    def test_probe_prefers_tags_and_reports_problems_per_file(self) -> None:
        tagged = self.make('x.flac', '-metadata', 'artist=Tester', '-metadata', 'title=Tone')
        result = garmin.probe_local(tagged)
        self.assertEqual(result['fields'], {'artist': 'Tester', 'title': 'Tone', 'album': ''})
        self.assertEqual(result['to'], 'MP3')
        self.assertEqual(garmin.probe_local(f'{self.root.name}/missing.mp3')['error'], 'File not found')

    def test_mp3_tags_are_written_into_a_copy_as_id3v23(self) -> None:
        source = self.make('in.mp3', '-metadata', 'artist=Old', '-metadata', 'album_artist=Old')
        before = hashlib.sha256(Path(source).read_bytes()).hexdigest()
        target = f'{self.root.name}/out.mp3'
        garmin.write_tags(source, target, 'copy', {'artist': 'New', 'title': 'T: x', 'album': ''}, self.tags(source))
        self.assertEqual(hashlib.sha256(Path(source).read_bytes()).hexdigest(), before)
        self.assertEqual(Path(target).read_bytes()[:4], b'ID3\x03')
        self.assertEqual(self.tags(target), {'artist': 'New', 'title': 'T: x', 'album': '', 'album_artist': 'New'})

    def test_m4a_and_raw_aac_get_mp4_tags(self) -> None:
        fields = {'artist': 'A', 'title': 'T', 'album': 'L'}
        for name, method in (('in.m4a', 'copy'), ('in.aac', 'remux')):
            source = self.make(name, '-c:a', 'aac')
            target = f'{self.root.name}/{name}.out.m4a'
            garmin.write_tags(source, target, method, fields, {})
            self.assertEqual(self.tags(target), dict(fields, album_artist=''), name)

    def test_flac_converts_to_mp3_with_the_edited_tags(self) -> None:
        source = self.make('tone.flac', '-metadata', 'artist=Tester', '-metadata', 'album=Tones')
        target = f'{self.root.name}/tone.mp3'
        garmin.write_tags(source, target, 'convert', {'artist': 'Edited', 'title': 'Tone', 'album': 'Tones'}, {})
        probe = json.loads(subprocess.run(
            ['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_name', '-of', 'json', target],
            capture_output=True, text=True, check=True).stdout)
        self.assertEqual(probe['streams'][0]['codec_name'], 'mp3')
        self.assertEqual(self.tags(target)['artist'], 'Edited')

    def test_ffmpeg_failure_is_readable(self) -> None:
        broken = f'{self.root.name}/broken.mp3'
        Path(broken).write_text('not audio')
        with self.assertRaisesRegex(garmin.WatchError, '^Writing tags failed: '):
            garmin.write_tags(broken, f'{self.root.name}/o.mp3', 'copy', {}, {})


if __name__ == '__main__':
    unittest.main()
