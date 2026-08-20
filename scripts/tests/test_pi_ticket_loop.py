#!/usr/bin/env python3

from __future__ import annotations

import hashlib
import json
import os
import runpy
import signal
import subprocess
import tempfile
import textwrap
import time
import unittest
from pathlib import Path

RUNNER = Path(__file__).resolve().parents[1] / 'pi-ticket-loop'


def run(*args: str, cwd: Path) -> subprocess.CompletedProcess[str]:
    process = subprocess.run(args, cwd=cwd, text=True, capture_output=True)
    if process.returncode:
        raise AssertionError(
            f'command failed ({process.returncode}): {args}\nstdout:\n{process.stdout}\nstderr:\n{process.stderr}'
        )
    return process


def wait_for_file(path: Path, process: subprocess.Popen[str], timeout: float = 3) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if path.exists():
            return
        if process.poll() is not None:
            stdout, stderr = process.communicate()
            raise AssertionError(f'runner exited before fake Pi started\nstdout:\n{stdout}\nstderr:\n{stderr}')
        time.sleep(0.02)
    raise AssertionError(f'timed out waiting for {path}')


def wait_for_glob(root: Path, pattern: str, process: subprocess.Popen[str], timeout: float = 3) -> Path:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        matches = list(root.glob(pattern))
        if matches:
            return matches[0]
        if process.poll() is not None:
            stdout, stderr = process.communicate()
            raise AssertionError(f'runner exited before {pattern} appeared\nstdout:\n{stdout}\nstderr:\n{stderr}')
        time.sleep(0.02)
    raise AssertionError(f'timed out waiting for {pattern} under {root}')


def wait_for_process_exit(process_id: int, timeout: float = 3) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            os.kill(process_id, 0)
        except ProcessLookupError:
            return
        time.sleep(0.02)
    raise AssertionError(f'process {process_id} is still running')


def create_loop_fixture(
    base: Path,
    *,
    pi_delay: float,
    resume_delay: float | None = None,
    spawn_stubborn_child: bool = False,
    write_partial_before_sleep: bool = False,
    emit_wrong_session: bool = False,
) -> tuple[Path, Path, Path, Path]:
    root = base / 'repository'
    issues = root / '.scratch' / 'effort' / 'issues'
    issues.mkdir(parents=True)
    (issues / '01-first.md').write_text(
        '# 01 — First\n\n'
        'Blocked by: None — can start immediately.\n\n'
        'Status: ready-for-agent\n',
        encoding='utf-8',
    )
    (issues / '02-second.md').write_text(
        '# 02 — Second\n\nBlocked by: 01\n\nStatus: ready-for-agent\n',
        encoding='utf-8',
    )
    run('git', 'init', '-q', cwd=root)
    run('git', 'config', 'user.email', 'test@example.com', cwd=root)
    run('git', 'config', 'user.name', 'Test', cwd=root)
    run('git', 'checkout', '-qb', 'work', cwd=root)
    run('git', 'add', '-f', '.scratch', cwd=root)
    run('git', 'commit', '-qm', 'base', cwd=root)

    skill = base / 'SKILL.md'
    skill.write_text(
        '---\nname: implement\ndescription: Test implementation skill.\n---\n\nImplement the ticket.\n',
        encoding='utf-8',
    )
    marker = base / 'fake-pi-started'
    child_pid = base / 'stubborn-child.pid'
    stubborn_child = base / 'stubborn-child'
    stubborn_child.write_text(
        textwrap.dedent(
            f'''\
            #!/usr/bin/env python3
            import os
            import signal
            import time
            from pathlib import Path

            signal.signal(signal.SIGTERM, lambda _signum, _frame: None)
            Path({str(child_pid)!r}).write_text(str(os.getpid()), encoding='utf-8')
            time.sleep(30)
            '''
        ),
        encoding='utf-8',
    )
    stubborn_child.chmod(0o755)

    fake_pi = base / 'fake-pi'
    fake_pi.write_text(
        textwrap.dedent(
            f'''\
            #!/usr/bin/env python3
            import json
            import re
            import subprocess
            import sys
            import time
            from pathlib import Path

            prompt = sys.argv[-1]
            ticket = re.search(r'^Pi-Ticket: (.+)$', prompt, re.MULTILINE).group(1)
            digest = re.search(r'^Pi-Ticket-SHA256: (.+)$', prompt, re.MULTILINE).group(1)
            resume = '--session' in sys.argv
            selector = '--session' if resume else '--session-id'
            session_id = sys.argv[sys.argv.index(selector) + 1]
            session_dir = Path(sys.argv[sys.argv.index('--session-dir') + 1])
            session_file = session_dir / f'fake_{{session_id}}.jsonl'
            if not resume:
                session_file.write_text(
                    json.dumps({{'type': 'session', 'id': session_id}}) + '\\n',
                    encoding='utf-8',
                )
            emitted_session_id = 'wrong-session' if {emit_wrong_session!r} else session_id
            print(json.dumps({{'type': 'session', 'id': emitted_session_id}}), flush=True)
            print(json.dumps({{'type': 'message_update', 'assistantMessageEvent': {{'type': 'thinking_start'}}}}), flush=True)
            print(json.dumps({{'type': 'message_update', 'assistantMessageEvent': {{'type': 'thinking_delta', 'delta': 'Inspecting ticket.'}}}}), flush=True)
            print(json.dumps({{'type': 'message_update', 'assistantMessageEvent': {{'type': 'thinking_end'}}}}), flush=True)
            print(json.dumps({{'type': 'tool_execution_start', 'toolName': 'read', 'args': {{'path': ticket}}}}), flush=True)
            if {spawn_stubborn_child!r}:
                subprocess.Popen([{str(stubborn_child)!r}])
                while not Path({str(child_pid)!r}).exists():
                    time.sleep(0.01)
            with Path({str(marker)!r}).open('a', encoding='utf-8') as marker_file:
                marker_file.write(('resume ' if resume else 'new ') + ticket + '\\n')
            output = Path(f'implemented-{{Path(ticket).name[:2]}}.txt')
            if {write_partial_before_sleep!r}:
                output.write_text('partial ' + ticket + '\\n', encoding='utf-8')
            delay = {resume_delay!r} if resume else {pi_delay!r}
            time.sleep(delay if delay is not None else {pi_delay!r})
            output.write_text(ticket + '\\n', encoding='utf-8')
            subprocess.run(['git', 'add', str(output)], check=True)
            message = (
                f'complete {{ticket}}\\n\\n'
                f'Pi-Ticket: {{ticket}}\\n'
                f'Pi-Ticket-SHA256: {{digest}}\\n'
                'Pi-Ticket-Status: complete'
            )
            subprocess.run(['git', 'commit', '-qm', message], check=True)
            print(json.dumps({{'type': 'agent_end'}}), flush=True)
            '''
        ),
        encoding='utf-8',
    )
    fake_pi.chmod(0o755)
    return root, issues, skill, marker


def start_loop(
    root: Path,
    issues: Path,
    skill: Path,
    fake_pi: Path,
    *,
    all_tickets: bool = True,
) -> subprocess.Popen[str]:
    command = [str(RUNNER), 'run', str(issues)]
    if all_tickets:
        command.append('--all')
    command.extend(['--pi', str(fake_pi), '--implement-skill', str(skill)])
    environment = os.environ.copy()
    environment['XDG_STATE_HOME'] = str(root.parent / 'state')
    return subprocess.Popen(
        command,
        cwd=root,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=environment,
    )


class WorktreeFingerprintTest(unittest.TestCase):
    def test_dirty_submodule_is_refused_for_automatic_resume(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            base = Path(temporary_directory)
            submodule = base / 'submodule-source'
            submodule.mkdir()
            run('git', 'init', '-q', cwd=submodule)
            run('git', 'config', 'user.email', 'test@example.com', cwd=submodule)
            run('git', 'config', 'user.name', 'Test', cwd=submodule)
            (submodule / 'file.txt').write_text('original\n', encoding='utf-8')
            run('git', 'add', 'file.txt', cwd=submodule)
            run('git', 'commit', '-qm', 'base', cwd=submodule)

            root = base / 'repository'
            root.mkdir()
            run('git', 'init', '-q', cwd=root)
            run('git', 'config', 'user.email', 'test@example.com', cwd=root)
            run('git', 'config', 'user.name', 'Test', cwd=root)
            run(
                'git',
                '-c',
                'protocol.file.allow=always',
                'submodule',
                'add',
                '-q',
                str(submodule),
                'modules/example',
                cwd=root,
            )
            run('git', 'commit', '-qam', 'add submodule', cwd=root)
            (root / 'modules/example/file.txt').write_text('changed\n', encoding='utf-8')

            module = runpy.run_path(str(RUNNER), run_name='pi_ticket_loop_test')
            with self.assertRaisesRegex(module['RunnerError'], 'dirty submodules'):
                module['worktree_fingerprint'](root)


class TicketHistoryTest(unittest.TestCase):
    def test_dot_prefixed_ticket_path_is_completed_by_matching_trailers(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            issues = root / '.scratch' / 'effort' / 'issues'
            issues.mkdir(parents=True)
            ticket = issues / '01-first.md'
            ticket.write_text(
                '# 01 — First\n\n'
                'Blocked by: None — can start immediately.\n\n'
                'Status: ready-for-agent\n',
                encoding='utf-8',
            )

            run('git', 'init', '-q', cwd=root)
            run('git', 'config', 'user.email', 'test@example.com', cwd=root)
            run('git', 'config', 'user.name', 'Test', cwd=root)
            run('git', 'add', '-f', str(ticket.relative_to(root)), cwd=root)
            run('git', 'commit', '-qm', 'base', cwd=root)

            digest = hashlib.sha256(ticket.read_bytes()).hexdigest()
            message = (
                'complete first\n\n'
                'Pi-Ticket: .scratch/effort/issues/01-first.md\n'
                f'Pi-Ticket-SHA256: {digest}\n'
                'Pi-Ticket-Status: complete'
            )
            run('git', 'commit', '--allow-empty', '-qm', message, cwd=root)

            status = run(str(RUNNER), 'status', str(issues), cwd=root)
            self.assertIn('01  COMPLETE', status.stdout)
            self.assertIn('frontier: none — all tickets are complete', status.stdout)


class InterruptTest(unittest.TestCase):
    def test_first_interrupt_finishes_current_ticket_and_stops_all_loop(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            base = Path(temporary_directory)
            root, issues, skill, marker = create_loop_fixture(base, pi_delay=0.5)
            process = start_loop(root, issues, skill, base / 'fake-pi')
            wait_for_file(marker, process)
            process.send_signal(signal.SIGINT)
            stdout, stderr = process.communicate(timeout=10)

            self.assertEqual(130, process.returncode, stdout + stderr)
            self.assertIn('ticket 01 will be allowed to finish', stderr)
            self.assertIn('pi prompt (verbatim):', stdout)
            self.assertIn('Implement exactly this local ticket:', stdout)
            self.assertIn('Treat the ticket as the complete and authoritative task specification.', stdout)
            self.assertNotIn('Read the parent specification at', stdout)
            self.assertIn('Completion contract:', stdout)
            self.assertIn('no blank lines between the three trailer lines', stdout)
            self.assertIn('[thinking] Inspecting ticket.', stdout)
            self.assertIn('[tool] read', stdout)
            self.assertIn('"path": ".scratch/effort/issues/01-first.md"', stdout)
            self.assertIn('Stopped after ticket 01', stdout)
            self.assertIn('implementation time:', stdout)
            self.assertEqual(1, len(marker.read_text(encoding='utf-8').splitlines()))
            self.assertEqual('2', run('git', 'rev-list', '--count', 'HEAD', cwd=root).stdout.strip())
            manifests = list((base / 'state').glob('pi-ticket-loop/*/*/attempts/01-first/*/attempt.json'))
            self.assertEqual(1, len(manifests))
            manifest = json.loads(manifests[0].read_text(encoding='utf-8'))
            self.assertGreater(manifest['agent_elapsed_seconds'], 0)
            self.assertNotIn('invocation_started_at', manifest)
            status = run(str(RUNNER), 'status', str(issues), cwd=root).stdout
            self.assertIn('01  COMPLETE', status)
            self.assertIn('02  READY', status)

    def test_second_interrupt_terminates_current_ticket_immediately(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            base = Path(temporary_directory)
            root, issues, skill, marker = create_loop_fixture(
                base,
                pi_delay=30,
                spawn_stubborn_child=True,
            )
            process = start_loop(root, issues, skill, base / 'fake-pi')
            wait_for_file(marker, process)
            process.send_signal(signal.SIGINT)
            time.sleep(0.05)
            process.send_signal(signal.SIGINT)
            stdout, stderr = process.communicate(timeout=6)

            self.assertEqual(130, process.returncode, stdout + stderr)
            self.assertIn('Second interrupt received; terminating immediately', stderr)
            self.assertIn('Interrupted; terminating Pi', stderr)
            self.assertEqual('1', run('git', 'rev-list', '--count', 'HEAD', cwd=root).stdout.strip())
            child_pid = int((base / 'stubborn-child.pid').read_text(encoding='utf-8'))
            wait_for_process_exit(child_pid)

    def test_interrupt_without_all_terminates_current_ticket_immediately(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            base = Path(temporary_directory)
            root, issues, skill, marker = create_loop_fixture(
                base,
                pi_delay=30,
                spawn_stubborn_child=True,
            )
            process = start_loop(root, issues, skill, base / 'fake-pi', all_tickets=False)
            wait_for_file(marker, process)
            process.send_signal(signal.SIGINT)
            stdout, stderr = process.communicate(timeout=6)

            self.assertEqual(130, process.returncode, stdout + stderr)
            self.assertNotIn('will be allowed to finish', stderr)
            self.assertIn('Interrupted; terminating Pi', stderr)
            self.assertEqual('1', run('git', 'rev-list', '--count', 'HEAD', cwd=root).stdout.strip())
            child_pid = int((base / 'stubborn-child.pid').read_text(encoding='utf-8'))
            wait_for_process_exit(child_pid)

    def test_interrupted_ticket_automatically_resumes_the_recorded_session(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            base = Path(temporary_directory)
            root, issues, skill, marker = create_loop_fixture(
                base,
                pi_delay=30,
                resume_delay=0,
                write_partial_before_sleep=True,
            )
            first_process = start_loop(root, issues, skill, base / 'fake-pi', all_tickets=False)
            wait_for_file(marker, first_process)
            wait_for_glob(base / 'state', '**/session-0001.id', first_process)
            first_process.send_signal(signal.SIGINT)
            first_stdout, first_stderr = first_process.communicate(timeout=6)
            self.assertEqual(130, first_process.returncode, first_stdout + first_stderr)
            self.assertIn('saved. Re-run the same ticket-loop command to resume it', first_stderr)
            self.assertTrue((root / 'implemented-01.txt').is_file())

            resumed_process = start_loop(root, issues, skill, base / 'fake-pi', all_tickets=False)
            resumed_stdout, resumed_stderr = resumed_process.communicate(timeout=10)
            self.assertEqual(0, resumed_process.returncode, resumed_stdout + resumed_stderr)
            self.assertIn('resuming interrupted Pi session', resumed_stdout)
            self.assertIn('no blank lines between the three trailer lines', resumed_stdout)
            self.assertEqual(
                ['new .scratch/effort/issues/01-first.md', 'resume .scratch/effort/issues/01-first.md'],
                marker.read_text(encoding='utf-8').splitlines(),
            )
            status = run(str(RUNNER), 'status', str(issues), cwd=root).stdout
            self.assertIn('01  COMPLETE', status)
            manifests = list((base / 'state').glob('pi-ticket-loop/*/*/attempts/01-first/*/attempt.json'))
            self.assertEqual(1, len(manifests))
            manifest = json.loads(manifests[0].read_text(encoding='utf-8'))
            self.assertEqual('complete', manifest['status'])
            self.assertEqual(2, manifest['invocation'])

    def test_resume_refuses_worktree_changes_made_after_interruption(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            base = Path(temporary_directory)
            root, issues, skill, marker = create_loop_fixture(
                base,
                pi_delay=30,
                resume_delay=0,
                write_partial_before_sleep=True,
            )
            first_process = start_loop(root, issues, skill, base / 'fake-pi', all_tickets=False)
            wait_for_file(marker, first_process)
            wait_for_glob(base / 'state', '**/session-0001.id', first_process)
            first_process.send_signal(signal.SIGINT)
            first_process.communicate(timeout=6)
            (root / 'implemented-01.txt').write_text('changed after interruption\n', encoding='utf-8')

            resumed_process = start_loop(root, issues, skill, base / 'fake-pi', all_tickets=False)
            resumed_stdout, resumed_stderr = resumed_process.communicate(timeout=6)
            self.assertEqual(1, resumed_process.returncode, resumed_stdout + resumed_stderr)
            self.assertIn('Refusing to resume ticket 01', resumed_stderr)
            self.assertIn('worktree contents changed after the attempt was interrupted', resumed_stderr)
            self.assertEqual(1, len(marker.read_text(encoding='utf-8').splitlines()))

    def test_mismatched_pi_session_is_not_recorded_as_resumable(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            base = Path(temporary_directory)
            root, issues, skill, marker = create_loop_fixture(
                base,
                pi_delay=30,
                emit_wrong_session=True,
            )
            process = start_loop(root, issues, skill, base / 'fake-pi', all_tickets=False)
            wait_for_file(marker, process)
            process.send_signal(signal.SIGINT)
            stdout, stderr = process.communicate(timeout=6)

            self.assertEqual(130, process.returncode, stdout + stderr)
            self.assertIn('could not record resumable Git state', stderr)
            self.assertIn('session identity was not verified', stderr)
            manifests = list((base / 'state').glob('pi-ticket-loop/*/*/attempts/01-first/*/attempt.json'))
            self.assertEqual(1, len(manifests))
            manifest = json.loads(manifests[0].read_text(encoding='utf-8'))
            self.assertEqual('running', manifest['status'])
            self.assertNotIn('verified_session_id', manifest)


if __name__ == '__main__':
    unittest.main()
