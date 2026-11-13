#!/usr/bin/env python3

import importlib.util
import json
import tempfile
import time
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / 'system' / 'ai-usage-claude.py'
spec = importlib.util.spec_from_file_location('ai_usage_claude', SCRIPT)
claude = importlib.util.module_from_spec(spec)
spec.loader.exec_module(claude)

NOW_MS = int(time.time() * 1000)


class PiLoginTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.auth = Path(self.temporary_directory.name) / 'auth.json'

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def _write(self, entry: dict) -> None:
        self.auth.write_text(json.dumps({'anthropic': entry}))

    def test_reads_subscription_login(self) -> None:
        self._write({'type': 'oauth', 'access': 'sk-ant-oat01-x', 'expires': NOW_MS + 60_000})
        self.assertEqual(claude.pi_login(self.auth), ('sk-ant-oat01-x', NOW_MS + 60_000, ''))

    def test_ignores_api_keys_and_missing_files(self) -> None:
        self._write({'type': 'api_key', 'key': 'sk-ant-api03-x'})
        self.assertEqual(claude.pi_login(self.auth), ('', 0, ''))
        self.assertEqual(claude.pi_login(self.auth.with_name('missing.json')), ('', 0, ''))


class ChooseLoginTest(unittest.TestCase):
    def test_prefers_first_live_login(self) -> None:
        cli = ('cli', NOW_MS + 60_000, 'Max 5x')
        pi = ('pi', NOW_MS + 60_000, '')
        self.assertEqual(claude.choose_login(cli, pi), cli)

    def test_falls_back_to_pi_when_claude_code_is_absent_or_expired(self) -> None:
        pi = ('pi', NOW_MS + 60_000, '')
        self.assertEqual(claude.choose_login(('', 0, ''), pi), pi)
        self.assertEqual(claude.choose_login(('cli', NOW_MS - 1, ''), pi), pi)

    def test_keeps_expired_login_so_panel_can_explain(self) -> None:
        expired = ('pi', NOW_MS - 1, '')
        self.assertEqual(claude.choose_login(('', 0, ''), expired), expired)
        self.assertEqual(claude.choose_login(('', 0, ''), ('', 0, '')), ('', 0, ''))



class LimitsBackoffTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.real = (claude.cache_root, claude.probe_limits)
        claude.cache_root = lambda: Path(self.temporary_directory.name)
        self.probes = 0

    def tearDown(self) -> None:
        claude.cache_root, claude.probe_limits = self.real
        self.temporary_directory.cleanup()

    def _probe(self, result: dict):
        def probe(_token: str) -> dict:
            self.probes += 1
            return result
        claude.probe_limits = probe

    def test_rate_limit_pauses_even_forced_probes_and_keeps_last_limits(self) -> None:
        limit = {'label': 'Session (5-hour)', 'percent': 0.4, 'resetsAt': ''}
        self._probe({'ok': True, 'limits': [limit]})
        claude.collect_limits('tok', 0, True)
        self._probe({'ok': False, 'helpText': 'rate limited', 'backoffSeconds': 300})
        self.assertEqual(claude.collect_limits('tok', 0, True)['limits'], [limit])
        self.assertEqual(claude.collect_limits('tok', 0, True)['limits'], [limit])
        self.assertEqual(self.probes, 2)

if __name__ == '__main__':
    unittest.main()
