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


EARBUDS = '/org/bluez/hci0/dev_70_5A_6F_6B_63_6F'


def objects(connected=True, uuids=(agent.A2DP_SINK,), transport=False):
    tree = {EARBUDS: {'org.bluez.Device1': {'Connected': connected, 'UUIDs': list(uuids)}}}
    if transport:
        tree[EARBUDS + '/sep8/fd0'] = {'org.bluez.MediaTransport1': {}}
    return tree


class AudioStuckTest(unittest.TestCase):
    def test_connected_headphones_without_a2dp_stream_are_stuck(self):
        self.assertTrue(agent.audio_stuck(EARBUDS, objects()))

    def test_a2dp_stream_means_audio_works(self):
        self.assertFalse(agent.audio_stuck(EARBUDS, objects(transport=True)))

    def test_disconnected_device_is_left_alone(self):
        self.assertFalse(agent.audio_stuck(EARBUDS, objects(connected=False)))

    def test_non_audio_device_is_left_alone(self):
        self.assertFalse(agent.audio_stuck(EARBUDS, objects(uuids=())))

    def test_vanished_device_is_left_alone(self):
        self.assertFalse(agent.audio_stuck(EARBUDS, {}))

    def test_other_device_transport_does_not_count(self):
        tree = objects()
        tree[EARBUDS + '0/sep1/fd0'] = {'org.bluez.MediaTransport1': {}}
        self.assertTrue(agent.audio_stuck(EARBUDS, tree))


if __name__ == '__main__':
    unittest.main()
