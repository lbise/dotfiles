#!/usr/bin/env python3

import importlib.util
import json
import os
import subprocess
import tempfile
import textwrap
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / 'system' / 'system-printers.py'
spec = importlib.util.spec_from_file_location('system_printers', SCRIPT)
printers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(printers)


class ParserTest(unittest.TestCase):
    def test_lpstat_reports_paused_printer_and_message(self) -> None:
        text = textwrap.dedent('''\
            printer MG5200 disabled since Mon 28 Sep 2026 05:26:12 PM CEST -
            \tPaper jam
            printer Office is idle.  enabled since Mon 28 Sep 2026 05:33:24 PM CEST
            printer Old disabled since Mon 28 Sep 2026 05:26:12 PM CEST -
            \treason unknown
            ''')
        self.assertEqual(printers.parse_lpstat_printers(text), [
            {'name': 'MG5200', 'enabled': False, 'message': 'Paper jam'},
            {'name': 'Office', 'enabled': True, 'message': ''},
            {'name': 'Old', 'enabled': False, 'message': ''},
        ])

    def test_lpstat_hides_filter_progress_chatter(self) -> None:
        text = textwrap.dedent('''\
            printer MG5200 now printing MG5200-65.  enabled since Mon 28 Sep 2026 05:43:53 PM CEST
            \tcfFilterChain: universal (PID 27474) exited with no errors.
            printer Office now printing Office-3.  enabled since Mon 28 Sep 2026 05:43:53 PM CEST
            \tSending data to printer.
            ''')
        self.assertEqual(
            [printer['message'] for printer in printers.parse_lpstat_printers(text)],
            ['', 'Sending data to printer.'],
        )

    def test_lpoptions_handles_quoted_values(self) -> None:
        options = printers.parse_lpoptions(
            "device-uri=cnijnet:/00-1E-8F-AD-3D-EC printer-make-and-model='Canon MG5200 series' printer-state=5"
        )
        self.assertEqual(options['printer-make-and-model'], 'Canon MG5200 series')
        self.assertEqual(options['printer-state'], '5')

    def test_lpq_jobs_keep_titles_with_spaces(self) -> None:
        text = textwrap.dedent('''\
            MG5200 is ready and printing
            Rank    Owner   Job     File(s)                         Total Size
            active  leo     62      My tax return.pdf               628736 bytes
            1st     leo     63      notes                           1024 bytes
            ''')
        self.assertEqual(printers.parse_lpq(text), [
            {'id': 62, 'owner': 'leo', 'title': 'My tax return.pdf', 'size': 628736, 'active': True},
            {'id': 63, 'owner': 'leo', 'title': 'notes', 'size': 1024, 'active': False},
        ])

    def test_reasons_are_readable(self) -> None:
        self.assertEqual(printers.parse_reasons('none'), [])
        self.assertEqual(
            printers.parse_reasons('media-empty-error,offline-report'),
            ['Media empty', 'Offline'],
        )

    def test_connections_are_classified(self) -> None:
        describe = printers.describe_connection
        self.assertEqual(describe('cnijnet:/00-1E-8F-AD-3D-EC'), {'kind': 'network', 'mac': '00:1e:8f:ad:3d:ec'})
        self.assertEqual(describe('ipp://printer.lan/ipp/print'), {'kind': 'network', 'host': 'printer.lan', 'port': 631})
        self.assertEqual(describe('socket://10.0.0.5:9101'), {'kind': 'network', 'host': '10.0.0.5', 'port': 9101})
        self.assertEqual(
            describe('dnssd://Canon%20MG5200%20series._ipp._tcp.local/?uuid=1'),
            {'kind': 'network', 'service': 'Canon MG5200 series'},
        )
        self.assertEqual(describe('usb://Canon/MG5200?serial=1'), {'kind': 'local'})
        self.assertEqual(describe('cups-pdf:/'), {'kind': 'local'})

    def test_neighbors_and_avahi_services(self) -> None:
        neighbors = printers.parse_neighbors(textwrap.dedent('''\
            192.168.1.28 dev enp12s0 lladdr 00:1e:8f:ad:3d:ec STALE
            192.168.1.30 dev enp12s0 FAILED
            fe80::1 dev enp12s0 lladdr aa:bb:cc:dd:ee:ff STALE
            '''))
        self.assertEqual(neighbors, {'00:1e:8f:ad:3d:ec': '192.168.1.28'})
        services = printers.parse_avahi_services(
            '=;wlan0;IPv4;Canon\\032MG5200\\032series;Internet Printer;local;mg.local;192.168.1.28;631;"txt"\n'
        )
        self.assertEqual(services, {'Canon MG5200 series': ('192.168.1.28', 631)})

    def test_mac_printer_missing_from_neighbors_is_unreachable(self) -> None:
        result = printers.check_reachability({'kind': 'network', 'mac': '00:1e:8f:ad:3d:ec'}, {}, {})
        self.assertFalse(result['reachable'])


class CommandTest(unittest.TestCase):
    """Run the script against fake CUPS and network commands."""

    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        self.log = self.root / 'commands.log'
        self._fake('lpstat', '''\
            case "$1" in
              -p) printf 'printer MG5200 disabled since Mon -\\n\\treason unknown\\n' ;;
              -d) echo 'no system default destination' ;;
            esac''')
        self._fake('lpoptions', '''\
            echo "device-uri=cnijnet:/00-1E-8F-AD-3D-EC printer-info=Kitchen printer-state=5 printer-state-reasons=paused printer-is-accepting-jobs=true"''')
        self._fake('lpq', '''\
            printf 'MG5200 is not ready\\nRank Owner Job File(s) Total Size\\n1st leo 62 scan.pdf 100 bytes\\n' ''')
        self._fake('ip', '''\
            echo '192.168.1.28 dev enp12s0 lladdr 00:1e:8f:ad:3d:ec STALE' ''')
        self._fake('ping', '''\
            echo '64 bytes from 192.168.1.28: icmp_seq=1 ttl=64 time=2.51 ms' ''')
        for command in ('cupsenable', 'cupsaccept', 'cupsdisable', 'cancel'):
            self._fake(command, '')

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def _fake(self, name: str, body: str) -> None:
        path = self.bin / name
        path.write_text(
            '#!/usr/bin/env bash\n'
            f'echo "{name} $*" >> "$FAKE_LOG"\n'
            + textwrap.dedent(body) + '\n'
        )
        path.chmod(0o755)

    def _run(self, *args: str) -> subprocess.CompletedProcess:
        env = dict(os.environ, PATH=f'{self.bin}:/usr/bin:/bin', FAKE_LOG=str(self.log))
        return subprocess.run([str(SCRIPT), *args], capture_output=True, text=True, env=env, check=False)

    def test_status_reports_paused_reachable_printer_with_job(self) -> None:
        result = self._run('status')
        self.assertEqual(result.returncode, 0, result.stderr)
        printer = json.loads(result.stdout)['printers'][0]
        self.assertEqual(printer['description'], 'Kitchen')
        self.assertEqual(printer['state'], 'paused')
        self.assertEqual(printer['reasons'], ['Paused'])
        self.assertEqual(printer['jobs'][0]['title'], 'scan.pdf')
        self.assertEqual(printer['network'], {'reachable': True, 'address': '192.168.1.28', 'detail': 'Ping 3 ms'})

    def test_resume_enables_and_accepts(self) -> None:
        result = self._run('resume', 'MG5200')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.log.read_text().splitlines(), ['cupsenable MG5200', 'cupsaccept MG5200'])

    def test_unknown_action_is_rejected(self) -> None:
        self.assertEqual(self._run('explode', 'MG5200').returncode, 2)


if __name__ == '__main__':
    unittest.main()
