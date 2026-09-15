#!/usr/bin/env python3

import json
import os
import subprocess
import tempfile
import textwrap
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / 'system' / 'system-clipboard.sh'


class SystemClipboardTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        self.bin_directory = self.root / 'bin'
        self.bin_directory.mkdir()
        self.log = self.root / 'hyprctl.jsonl'
        self.sleep_log = self.root / 'sleep.log'
        self._write_fake_hyprctl()
        self._write_fake_sleep()

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def _write_fake_hyprctl(self) -> None:
        fake_hyprctl = self.bin_directory / 'hyprctl'
        fake_hyprctl.write_text(
            textwrap.dedent(
                '''\
                #!/usr/bin/env python3
                import json
                import os
                import sys

                args = sys.argv[1:]
                with open(os.environ['HYPRCTL_LOG'], 'a', encoding='utf-8') as log:
                    log.write(json.dumps(args) + '\\n')
                if args == ['-j', 'activewindow']:
                    if os.environ.get('HYPRCTL_QUERY_FAIL'):
                        sys.exit(71)
                    sys.stdout.write(os.environ.get('ACTIVE_WINDOW_JSON', '{}'))
                    sys.exit(0)
                if args[:2] == ['dispatch', 'sendkeystate']:
                    sys.exit(0)
                sys.exit(72)
                '''
            ),
            encoding='utf-8',
        )
        fake_hyprctl.chmod(0o755)

    def _write_fake_sleep(self) -> None:
        fake_sleep = self.bin_directory / 'sleep'
        fake_sleep.write_text(
            '#!/usr/bin/env bash\n'
            'printf "%s\\n" "$*" >> "$SLEEP_LOG"\n'
            'if [[ -n ${SLEEP_FAIL:-} ]]; then exit "$SLEEP_FAIL"; fi\n'
            'exec /usr/bin/sleep "$@"\n',
            encoding='utf-8',
        )
        fake_sleep.chmod(0o755)

    def invoke(self, operation: str, window: object = None, **environment: str) -> subprocess.CompletedProcess[str]:
        child_environment = os.environ.copy()
        child_environment.update(environment)
        child_environment['PATH'] = f'{self.bin_directory}:{child_environment["PATH"]}'
        child_environment['HYPRCTL_LOG'] = str(self.log)
        child_environment['SLEEP_LOG'] = str(self.sleep_log)
        if window is not None:
            child_environment['ACTIVE_WINDOW_JSON'] = json.dumps(window)
        return subprocess.run(
            [str(SCRIPT), operation],
            text=True,
            capture_output=True,
            env=child_environment,
            check=False,
        )

    def commands(self) -> list[list[str]]:
        if not self.log.exists():
            return []
        return [json.loads(line) for line in self.log.read_text(encoding='utf-8').splitlines()]

    def assert_key_states(self, modifier: str, key: str, address: str) -> None:
        self.assertEqual(
            [
                ['-j', 'activewindow'],
                ['dispatch', 'sendkeystate', f'{modifier}, {key}, down, address:{address}'],
                ['dispatch', 'sendkeystate', f'{modifier}, {key}, up, address:{address}'],
            ],
            self.commands(),
        )
        self.assertEqual(['0.05'], self.sleep_log.read_text(encoding='utf-8').splitlines())

    def test_gui_copy_and_paste_use_control_chords(self) -> None:
        window = {'address': '0xabc', 'class': 'org.example.Editor'}
        for operation, key in (('copy', 'c'), ('paste', 'v')):
            with self.subTest(operation=operation):
                self.log.unlink(missing_ok=True)
                self.sleep_log.unlink(missing_ok=True)
                result = self.invoke(operation, window)
                self.assertEqual(0, result.returncode, result.stderr)
                self.assert_key_states('CTRL', key, '0xabc')

    def test_ghostty_copy_and_paste_use_insert_chords(self) -> None:
        window = {'address': '0xAbC', 'class': 'com.mitchellh.ghostty'}
        for operation, modifier in (('copy', 'CTRL'), ('paste', 'SHIFT')):
            with self.subTest(operation=operation):
                self.log.unlink(missing_ok=True)
                self.sleep_log.unlink(missing_ok=True)
                result = self.invoke(operation, window)
                self.assertEqual(0, result.returncode, result.stderr)
                self.assert_key_states(modifier, 'Insert', '0xAbC')

    def test_initial_class_identifies_ghostty(self) -> None:
        result = self.invoke(
            'copy',
            {'address': '0x123', 'class': 'changed.title', 'initialClass': 'com.mitchellh.ghostty'},
        )
        self.assertEqual(0, result.returncode, result.stderr)
        self.assert_key_states('CTRL', 'Insert', '0x123')

    def test_no_active_window_is_a_no_op(self) -> None:
        result = self.invoke('copy', {})
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual([['-j', 'activewindow']], self.commands())

    def test_invalid_operation_does_not_query_hyprland(self) -> None:
        result = self.invoke('cut')
        self.assertNotEqual(0, result.returncode)
        self.assertEqual([], self.commands())

    def test_query_and_json_failures_do_not_inject_keys(self) -> None:
        with self.subTest('query failure'):
            result = self.invoke('copy', HYPRCTL_QUERY_FAIL='1')
            self.assertNotEqual(0, result.returncode)
            self.assertEqual([['-j', 'activewindow']], self.commands())
        with self.subTest('malformed JSON'):
            self.log.unlink(missing_ok=True)
            result = self.invoke('paste', None, ACTIVE_WINDOW_JSON='{not json')
            self.assertNotEqual(0, result.returncode)
            self.assertEqual([['-j', 'activewindow']], self.commands())

    def test_invalid_address_does_not_inject_keys(self) -> None:
        result = self.invoke('copy', {'address': 'not-an-address', 'class': 'com.mitchellh.ghostty'})
        self.assertNotEqual(0, result.returncode)
        self.assertEqual([['-j', 'activewindow']], self.commands())

    def test_sleep_failure_releases_the_pressed_key(self) -> None:
        result = self.invoke(
            'copy',
            {'address': '0x456', 'class': 'org.example.Editor'},
            SLEEP_FAIL='73',
        )
        self.assertEqual(73, result.returncode, result.stderr)
        self.assert_key_states('CTRL', 'c', '0x456')


if __name__ == '__main__':
    unittest.main()
