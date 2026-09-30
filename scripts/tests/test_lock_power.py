#!/usr/bin/env python3
"""Exercise confirmation without running any real power command."""

import importlib.util
import json
import os
import tempfile
import subprocess
import time
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / 'system/system-lock-power.py'
spec = importlib.util.spec_from_file_location('lock_power', SCRIPT)
power = importlib.util.module_from_spec(spec)
spec.loader.exec_module(power)


class ConfirmationTest(unittest.TestCase):
    def test_second_click_executes_and_clears_pending(self):
        state, execute = power.transition({}, 'reboot', 100)
        self.assertFalse(execute)
        state, execute = power.transition(state, 'reboot', 102)
        self.assertTrue(execute)
        self.assertEqual(state, {})

    def test_expired_different_or_future_action_only_arms(self):
        for state in ({'action': 'reboot', 'at': 97},
                      {'action': 'poweroff', 'at': 99},
                      {'action': 'reboot', 'at': 101}):
            state, execute = power.transition(state, 'reboot', 100)
            self.assertFalse(execute)
            self.assertEqual(state, {'action': 'reboot', 'at': 100})

    def test_runtime_state_and_status_never_execute(self):
        with tempfile.TemporaryDirectory() as directory, \
                patch.dict(os.environ, XDG_RUNTIME_DIR=directory), \
                patch.object(power.subprocess, 'run') as run:
            self.assertEqual(power.main(['reboot']), 0)
            self.assertEqual(power.main(['status', 'reboot']), 0)
            run.assert_not_called()
            run.return_value.returncode = 0
            self.assertEqual(power.main(['reboot']), 0)
            run.assert_called_once_with(['systemctl', 'reboot', '--no-wall'], check=False)
            self.assertEqual((Path(directory) / 'leo-lock-power.json').stat().st_mode & 0o777, 0o600)

    def test_shell_labels_match_pending_actions(self):
        reader = SCRIPT.with_name('system-lock-power-status.sh')
        with tempfile.TemporaryDirectory() as directory:
            env = dict(os.environ, XDG_RUNTIME_DIR=directory)
            state = Path(directory) / 'leo-lock-power.json'
            now = time.clock_gettime(time.CLOCK_BOOTTIME)
            for value, action, label in (
                ({'action': 'reboot', 'at': now}, 'reboot', 'Confirm Restart'),
                ({'action': 'reboot', 'at': now}, 'poweroff', 'Shut down'),
                ({'action': 'poweroff', 'at': now}, 'poweroff', 'Confirm Shut down'),
                ({'action': 'reboot', 'at': now - 10}, 'reboot', 'Restart'),
                ({'action': 'reboot', 'at': now + 10}, 'reboot', 'Restart'),
                ({}, 'reboot', 'Restart'),
            ):
                state.write_text(json.dumps(value))
                result = subprocess.run(['bash', str(reader), action], env=env,
                                        text=True, capture_output=True, check=True)
                self.assertEqual(result.stdout.strip(), label, result.stderr)
            state.write_text('truncated garbage')
            self.assertEqual(subprocess.check_output(['bash', str(reader), 'reboot'], env=env,
                                                    text=True).strip(), 'Restart')
            state.unlink()
            self.assertEqual(subprocess.check_output(['bash', str(reader), 'reboot'], env=env,
                                                    text=True).strip(), 'Restart')

    def test_invalid_arguments_never_execute(self):
        with patch.object(power.subprocess, 'run') as run:
            for args in ([], ['unlock'], ['status', 'suspend'], ['reboot', 'anything']):
                self.assertEqual(power.main(args), 2)
            run.assert_not_called()

    def test_symlinked_state_never_executes(self):
        with tempfile.TemporaryDirectory() as directory, \
                patch.dict(os.environ, XDG_RUNTIME_DIR=directory), \
                patch.object(power.subprocess, 'run') as run:
            (Path(directory) / 'leo-lock-power.json').symlink_to('/dev/null')
            self.assertEqual(power.main(['reboot']), 1)
            run.assert_not_called()


if __name__ == '__main__':
    unittest.main()
