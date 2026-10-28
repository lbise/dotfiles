#!/usr/bin/env python3
"""Check the pairing agent's answers without D-Bus or python-gobject."""

import importlib.util
import sys
import types
import unittest
from pathlib import Path

# Stub gi so the policy can be tested where python-gobject is missing.
gi = types.ModuleType('gi')
gi.repository = types.ModuleType('gi.repository')
gi.repository.Gio = gi.repository.GLib = None
sys.modules.setdefault('gi', gi)
sys.modules.setdefault('gi.repository', gi.repository)

SCRIPT = Path(__file__).resolve().parents[1] / 'system/system-bt-agent.py'
spec = importlib.util.spec_from_file_location('bt_agent', SCRIPT)
agent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agent)


class DecideTest(unittest.TestCase):
    def test_pairing_started_from_the_bar_is_accepted(self):
        self.assertEqual(agent.decide('RequestConfirmation'), ('accept', None))
        self.assertEqual(agent.decide('RequestAuthorization'), ('accept', None))

    def test_legacy_pin_is_0000(self):
        self.assertEqual(agent.decide('RequestPinCode'), ('accept', '0000'))

    def test_passkey_entry_is_rejected(self):
        self.assertEqual(agent.decide('RequestPasskey'), ('reject', None))

    def test_services_only_for_paired_devices(self):
        self.assertEqual(agent.decide('AuthorizeService', paired=True), ('accept', None))
        self.assertEqual(agent.decide('AuthorizeService', paired=False), ('reject', None))

    def test_notifications_are_acknowledged(self):
        for method in ('Release', 'Cancel', 'DisplayPinCode', 'DisplayPasskey'):
            self.assertEqual(agent.decide(method), ('accept', None))


if __name__ == '__main__':
    unittest.main()
