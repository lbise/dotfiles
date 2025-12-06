#!/usr/bin/env python3
"""
Complete Andromeda Sanity Log Viewer

A comprehensive tool for viewing and analyzing sanity test logs from the andromeda build system.
"""

import argparse
import datetime
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Iterator


class SanityRun:
    """Represents a single sanity test run with its logs and metadata."""

    def __init__(self, run_path: Path):
        self.path = run_path
        self.name = run_path.name
        self.timestamp = self._parse_timestamp()
        self.components = self._load_components()
        self.step_logs = self._discover_step_logs()
        self.master_log = run_path / 'master_log.txt'

    def _parse_timestamp(self) -> Optional[datetime.datetime]:
        """Parse timestamp from directory name (YYYYMMDD_HHMMSS format)."""
        match = re.match(r'(\d{8})_(\d{6})', self.name)
        if match:
            date_str, time_str = match.groups()
            return datetime.datetime.strptime(f'{date_str}_{time_str}', '%Y%m%d_%H%M%S')
        return None

    def _load_components(self) -> Dict[str, str]:
        """Load component versions from components.txt."""
        components = {}
        components_file = self.path / 'components.txt'
        if components_file.exists():
            with open(components_file, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#'):
                        if '=' in line:
                            key, value = line.split('=', 1)
                            components[key.strip()] = value.strip()
                        elif '[' in line and 'revision=' in line:
                            # Parse git repo info: name [type=src, remote=origin, ...]
                            parts = line.split('[', 1)
                            if len(parts) == 2:
                                name = parts[0].strip()
                                attrs = parts[1].rstrip(']')
                                # Extract revision
                                rev_match = re.search(r'revision=([^,\]]+)', attrs)
                                if rev_match:
                                    components[name] = rev_match.group(1).strip()
        return components

    def _discover_step_logs(self) -> List[str]:
        """Discover all step log files (*_log.txt except master_log.txt)."""
        step_logs = []
        for log_file in self.path.glob('*_log.txt'):
            if log_file.name != 'master_log.txt':
                step_name = log_file.stem.replace('_log', '')
                step_logs.append(step_name)
        return sorted(step_logs)

    def get_step_log_path(self, step_name: str) -> Path:
        """Get the path to a specific step log."""
        return self.path / f'{step_name}_log.txt'

    def __str__(self) -> str:
        timestamp_str = self.timestamp.strftime('%Y-%m-%d %H:%M:%S') if self.timestamp else 'Unknown'
        return f'{self.name} ({timestamp_str}) - {len(self.step_logs)} steps'


class LogParser:
    """Parser for andromeda log files."""

    @staticmethod
    def parse_log_line(line: str) -> Tuple[Optional[int], str]:
        """Parse a log line and extract line number and content."""
        line = line.rstrip('\n')
        # Check if line starts with a number (timestamp) followed by log content
        match = re.match(r'^(\d+)\s+(.*)$', line)
        if match:
            timestamp = int(match.group(1))
            content = match.group(2)
            return timestamp, content
        return None, line

    @staticmethod
    def extract_log_level(content: str) -> Optional[str]:
        """Extract log level from content (INFO, DEBUG, ERROR, etc.)."""
        # Match ANSI colored log levels like: "194 \x1b[1;32mINFO\x1b[0m"
        match = re.search(r'\x1b\[1;\d+m(\w+)\x1b\[0m', content)
        if match:
            return match.group(1)
        return None

    @staticmethod
    def extract_step_header(content: str) -> Optional[str]:
        """Extract step name from step header lines."""
        # Match lines like: "CortiUpdate : $PYTHON310_EXE build.py ..."
        if ':' in content and not content.startswith(' '):
            step_name = content.split(':', 1)[0].strip()
            if step_name and not any(char in step_name for char in ['/', '\\', '[', ']']):
                return step_name
        return None


class SanityLogViewer:
    """Complete log viewer application with all features."""

    def __init__(self, sanity_dir: Optional[Path] = None):
        self.sanity_dir = sanity_dir or Path('sanity')
        self.runs = self._discover_runs()

    def _discover_runs(self) -> List[SanityRun]:
        """Discover all sanity test runs."""
        runs = []
        if self.sanity_dir.exists():
            for run_dir in self.sanity_dir.iterdir():
                if run_dir.is_dir():
                    runs.append(SanityRun(run_dir))
        return sorted(runs, key=lambda r: r.timestamp or datetime.datetime.min, reverse=True)

    def list_runs(self) -> None:
        """List all available sanity runs."""
        if not self.runs:
            print('No sanity runs found.')
            return

        print(f'Found {len(self.runs)} sanity run(s):')
        print()
        for i, run in enumerate(self.runs, 1):
            print(f'{i:2d}. {run}')

    def show_run_details(self, run_name: str) -> None:
        """Show detailed information about a specific run."""
        run = self._find_run(run_name)
        if not run:
            print(f'Run "{run_name}" not found.')
            return

        print(f'Sanity Run: {run.name}')
        print(f'Timestamp: {run.timestamp.strftime("%Y-%m-%d %H:%M:%S") if run.timestamp else "Unknown"}')
        print()

        print('Components:')
        for name, version in run.components.items():
            print(f'  {name}: {version}')
        print()

        print('Test Steps:')
        for step in run.step_logs:
            print(f'  - {step}')

    def view_log(
        self, run_name: str, step_name: Optional[str] = None, lines: Optional[str] = None, use_pager: bool = True
    ) -> None:
        """View a specific log file."""
        run = self._find_run(run_name)
        if not run:
            print(f'Run "{run_name}" not found.')
            return

        if step_name:
            if step_name not in run.step_logs:
                print(f'Step "{step_name}" not found in run "{run_name}".')
                print(f'Available steps: {", ".join(run.step_logs)}')
                return
            log_file = run.get_step_log_path(step_name)
            title = f'Viewing {step_name} log from {run.name}'
        else:
            log_file = run.master_log
            title = f'Viewing master log from {run.name}'

        if not log_file.exists():
            print(f'Log file not found: {log_file}')
            return

        # Parse line range if provided
        start_line, end_line, max_lines = self._parse_line_range(lines)

        if use_pager and lines is None:
            # Use pager for full log viewing
            self._display_log_with_pager(log_file, title)
        else:
            # Direct output with line limits
            print(title)
            print('=' * 80)
            self._display_log_content(log_file, start_line, end_line, max_lines)

    def _parse_line_range(self, lines: Optional[str]) -> Tuple[Optional[int], Optional[int], Optional[int]]:
        """Parse line range specification like '10', '10:50', ':50', '10:' etc."""
        if lines is None:
            return None, None, None

        if ':' in lines:
            # Range specification like "10:50", ":50", "10:"
            parts = lines.split(':', 1)
            start_str, end_str = parts[0].strip(), parts[1].strip()

            start_line = int(start_str) if start_str else None
            end_line = int(end_str) if end_str else None

            return start_line, end_line, None
        else:
            # Single number like "50" - treat as max lines from start
            try:
                max_lines = int(lines)
                return None, None, max_lines
            except ValueError:
                print(f'Invalid line specification: {lines}')
                return None, None, 50  # Default fallback

    def _display_log_with_pager(self, log_file: Path, title: str) -> None:
        """Display log file using a pager (less/more)."""
        try:
            # Try to use 'less' first, fall back to 'more'
            pager_cmd = 'less'
            if subprocess.run(['which', 'less'], capture_output=True).returncode != 0:
                pager_cmd = 'more'

            # Prepare the content with formatting
            formatted_content = self._format_log_for_pager(log_file, title)

            # Use pager to display content
            process = subprocess.Popen([pager_cmd, '-R'], stdin=subprocess.PIPE, text=True)
            process.communicate(input=formatted_content)

        except Exception as e:
            print(f'Error using pager: {e}')
            print('Falling back to direct display...')
            print(title)
            print('=' * 80)
            self._display_log_content(log_file, None, None, None)

    def _format_log_for_pager(self, log_file: Path, title: str) -> str:
        """Format log content for pager display."""
        lines = [title, '=' * 80, '']

        try:
            with open(log_file, 'r', encoding='utf-8', errors='replace') as f:
                for line in f:
                    timestamp, content = LogParser.parse_log_line(line)
                    if timestamp:
                        log_level = LogParser.extract_log_level(content)
                        if log_level:
                            lines.append(f'{timestamp:5d} [{log_level:5s}] {content}')
                        else:
                            lines.append(f'{timestamp:5d} {content}')
                    else:
                        lines.append(content)
        except Exception as e:
            lines.append(f'Error reading log file: {e}')

        return '\n'.join(lines)

    def _display_log_content(
        self, log_file: Path, start_line: Optional[int], end_line: Optional[int], max_lines: Optional[int]
    ) -> None:
        """Display log file content with formatting and optional line range."""
        try:
            with open(log_file, 'r', encoding='utf-8', errors='replace') as f:
                current_line = 0
                displayed_lines = 0

                for line in f:
                    current_line += 1

                    # Check if we should skip this line based on start_line
                    if start_line is not None and current_line < start_line:
                        continue

                    # Check if we've reached the end_line
                    if end_line is not None and current_line > end_line:
                        break

                    # Check if we've hit the max_lines limit
                    if max_lines is not None and displayed_lines >= max_lines:
                        print(f'\n... (showing first {max_lines} lines, use --lines to see more)')
                        break

                    timestamp, content = LogParser.parse_log_line(line)
                    if timestamp:
                        # Format with timestamp
                        log_level = LogParser.extract_log_level(content)
                        if log_level:
                            print(f'{timestamp:5d} [{log_level:5s}] {content}')
                        else:
                            print(f'{timestamp:5d} {content}')
                    else:
                        print(content)

                    displayed_lines += 1

                # Show summary if we used line range
                if start_line is not None or end_line is not None:
                    range_str = f'{start_line or 1}:{end_line or "end"}'
                    print(f'\n... (showing lines {range_str})')

        except Exception as e:
            print(f'Error reading log file: {e}')

    def search_logs(
        self, run_name: str, pattern: str, step_name: Optional[str] = None, case_sensitive: bool = False
    ) -> None:
        """Search for a pattern in log files."""
        run = self._find_run(run_name)
        if not run:
            print(f'Run "{run_name}" not found.')
            return

        if step_name:
            if step_name not in run.step_logs:
                print(f'Step "{step_name}" not found.')
                return
            log_files = [(step_name, run.get_step_log_path(step_name))]
        else:
            log_files = [(step, run.get_step_log_path(step)) for step in run.step_logs]
            log_files.append(('master', run.master_log))

        flags = 0 if case_sensitive else re.IGNORECASE
        regex = re.compile(pattern, flags)

        total_matches = 0
        for step, log_file in log_files:
            if not log_file.exists():
                continue

            matches = list(self._search_in_file(log_file, regex))
            if matches:
                print(f'\n=== {step} log ({len(matches)} matches) ===')
                for timestamp, content in matches:
                    highlighted = regex.sub(lambda m: f'**{m.group()}**', content)
                    print(f'{timestamp:5d}: {highlighted}')
                total_matches += len(matches)

        print(f'\nTotal matches: {total_matches}')

    def _search_in_file(self, log_file: Path, regex: re.Pattern) -> Iterator[Tuple[int, str]]:
        """Search for pattern in a single log file."""
        try:
            with open(log_file, 'r', encoding='utf-8', errors='replace') as f:
                for line in f:
                    timestamp, content = LogParser.parse_log_line(line)
                    if content and regex.search(content):
                        yield timestamp or 0, content
        except Exception as e:
            print(f'Error searching {log_file}: {e}')

    def filter_by_log_level(self, run_name: str, log_level: str, step_name: Optional[str] = None) -> None:
        """Filter logs by log level (INFO, DEBUG, ERROR, etc.)."""
        run = self._find_run(run_name)
        if not run:
            print(f'Run "{run_name}" not found.')
            return

        if step_name:
            if step_name not in run.step_logs:
                print(f'Step "{step_name}" not found.')
                return
            log_file = run.get_step_log_path(step_name)
            print(f'Filtering {step_name} log for {log_level} messages')
        else:
            log_file = run.master_log
            print(f'Filtering master log for {log_level} messages')

        if not log_file.exists():
            print(f'Log file not found: {log_file}')
            return

        print('=' * 80)
        count = 0
        try:
            with open(log_file, 'r', encoding='utf-8', errors='replace') as f:
                for line in f:
                    timestamp, content = LogParser.parse_log_line(line)
                    if content:
                        detected_level = LogParser.extract_log_level(content)
                        if detected_level and detected_level.upper() == log_level.upper():
                            print(f'{timestamp:5d} [{detected_level:5s}] {content}')
                            count += 1

            print(f'\nFound {count} {log_level} messages.')
        except Exception as e:
            print(f'Error reading log file: {e}')

    def show_step_summary(self, run_name: str) -> None:
        """Show a summary of all steps with their status."""
        run = self._find_run(run_name)
        if not run:
            print(f'Run "{run_name}" not found.')
            return

        print(f'Step Summary for {run.name}')
        print('=' * 80)

        total_duration_seconds = 0.0
        steps_with_duration = 0

        for step in run.step_logs:
            log_file = run.get_step_log_path(step)
            if not log_file.exists():
                print(f'{step:30s} - Log file missing')
                continue

            duration = self._extract_step_duration(log_file)
            test_result = self._extract_test_result(log_file)

            # Add to total duration if available
            if duration:
                try:
                    # Parse duration like "364.01s" to float
                    duration_value = float(duration.rstrip('s'))
                    total_duration_seconds += duration_value
                    steps_with_duration += 1
                except ValueError:
                    pass

            # Determine status based on test results if available, otherwise use log analysis
            if test_result:
                if test_result['failures'] > 0 or test_result['errors'] > 0:
                    status = 'FAILED'
                else:
                    status = 'PASSED'
            else:
                status = self._analyze_step_status(log_file)

            # Format duration
            duration_str = f'({duration})' if duration else ''

            # Format test result with full words
            result_str = ''
            if test_result:
                if test_result['failures'] > 0 or test_result['errors'] > 0:
                    result_str = f" - {test_result['failures']} Failures, {test_result['errors']} Errors, {test_result['total']} Tests"
                else:
                    result_str = f" - {test_result['total']} Tests PASSED"

            print(f'{step:30s} - {status} {duration_str}{result_str}')

        # Display total duration
        print('=' * 80)
        if steps_with_duration > 0:
            # Convert to minutes and seconds for readability
            total_minutes = int(total_duration_seconds // 60)
            remaining_seconds = total_duration_seconds % 60
            if total_minutes > 0:
                print(
                    f'Total Duration: {total_minutes}m {remaining_seconds:.2f}s ({total_duration_seconds:.2f}s total)'
                )
            else:
                print(f'Total Duration: {total_duration_seconds:.2f}s')
            print(f'Steps with timing: {steps_with_duration}/{len(run.step_logs)}')
        else:
            print('Total Duration: No timing information available')

    def _analyze_step_status(self, log_file: Path) -> str:
        """Analyze step status from log content."""
        try:
            with open(log_file, 'r', encoding='utf-8', errors='replace') as f:
                lines = f.readlines()

                # Check the last few lines for completion indicators
                last_lines = ''.join(lines[-10:]).lower()

                # If we have a Total duration line, the step likely completed
                if 'total duration:' in last_lines:
                    # Look for explicit failure indicators near the end
                    if any(phrase in last_lines for phrase in ['build failed', 'compilation failed', 'step failed']):
                        return 'FAILED'
                    else:
                        return 'COMPLETED'

                # Look for explicit completion/success indicators
                if any(phrase in last_lines for phrase in ['done', 'success', 'completed successfully']):
                    return 'COMPLETED'

                # Look for explicit failure indicators at the end
                if any(phrase in last_lines for phrase in ['build failed', 'compilation failed', 'step failed']):
                    return 'FAILED'

                # Default to unknown if we can't determine
                return 'UNKNOWN'
        except Exception:
            return 'ERROR'

    def _extract_step_duration(self, log_file: Path) -> Optional[str]:
        """Extract total duration from 'Total duration:' line at end of log file."""
        try:
            with open(log_file, 'r', encoding='utf-8', errors='replace') as f:
                lines = f.readlines()
                # Look for "Total duration:" line from the end
                for line in reversed(lines):
                    if line.strip().startswith('Total duration:'):
                        # Extract duration like "Total duration: 364.01s"
                        match = re.search(r'Total duration:\s*([0-9]+\.?[0-9]*s)', line)
                        if match:
                            return match.group(1)
        except Exception:
            pass
        return None

    def _extract_test_result(self, log_file: Path) -> Optional[dict]:
        """Extract overall test result and counts from log file."""
        try:
            with open(log_file, 'r', encoding='utf-8', errors='replace') as f:
                content = f.read()
                # Look for "Overall result:" line with ANSI escape sequences
                match = re.search(
                    r'Overall result:\s*(\w+)\s+total=(\d+)\s+failures=(\d+)\s+errors=(\d+)\s+skipped=(\d+),?\s*not_applicable=(\d+),?\s*soundCardFailures=(\d+)',
                    content,
                )
                if match:
                    return {
                        'status': match.group(1),
                        'total': int(match.group(2)),
                        'failures': int(match.group(3)),
                        'errors': int(match.group(4)),
                        'skipped': int(match.group(5)),
                        'not_applicable': int(match.group(6)),
                        'soundcard_failures': int(match.group(7)),
                    }
        except Exception:
            pass
        return None

    def compare_runs(self, run1_name: str, run2_name: str) -> None:
        """Compare two sanity runs."""
        run1 = self._find_run(run1_name)
        run2 = self._find_run(run2_name)

        if not run1:
            print(f'Run "{run1_name}" not found.')
            return
        if not run2:
            print(f'Run "{run2_name}" not found.')
            return

        print(f'Comparing {run1.name} vs {run2.name}')
        print('=' * 80)

        # Compare timestamps
        if run1.timestamp and run2.timestamp:
            time_diff = abs((run1.timestamp - run2.timestamp).total_seconds())
            print(f'Time difference: {time_diff:.0f} seconds')

        # Compare components
        print('\nComponent differences:')
        all_components = set(run1.components.keys()) | set(run2.components.keys())
        for comp in sorted(all_components):
            ver1 = run1.components.get(comp, 'MISSING')
            ver2 = run2.components.get(comp, 'MISSING')
            if ver1 != ver2:
                print(f'  {comp}:')
                print(f'    {run1.name}: {ver1}')
                print(f'    {run2.name}: {ver2}')

        # Compare steps
        print('\nStep differences:')
        steps1 = set(run1.step_logs)
        steps2 = set(run2.step_logs)

        only_in_1 = steps1 - steps2
        only_in_2 = steps2 - steps1

        if only_in_1:
            print(f'  Only in {run1.name}: {", ".join(sorted(only_in_1))}')
        if only_in_2:
            print(f'  Only in {run2.name}: {", ".join(sorted(only_in_2))}')
        if not only_in_1 and not only_in_2:
            print('  No step differences found.')

    def _find_run(self, run_name: str) -> Optional[SanityRun]:
        """Find a run by name or partial name."""
        # Try exact match first
        for run in self.runs:
            if run.name == run_name:
                return run

        # Try partial match
        matches = [run for run in self.runs if run_name in run.name]
        if len(matches) == 1:
            return matches[0]
        elif len(matches) > 1:
            print(f'Multiple runs match "{run_name}":')
            for run in matches:
                print(f'  {run.name}')
            return None

        return None


def main():
    parser = argparse.ArgumentParser(
        description='Andromeda Sanity Log Viewer - Analyze and navigate sanity test logs',
        epilog='''
Examples:
  %(prog)s list                                    # List all sanity runs
  %(prog)s show 20250825_130529                    # Show details for a specific run
  %(prog)s summary 20250825_130529                 # Show step summary with durations and test results
  %(prog)s view 20250825_130529 --step dmtx_simple # View specific step log
  %(prog)s view 20250825_130529 --lines 100:200    # View lines 100-200 of master log
  %(prog)s search 20250825_130529 "ERROR.*timeout" # Search for pattern in logs
  %(prog)s filter 20250825_130529 ERROR            # Filter by log level
  %(prog)s compare run1 run2                       # Compare two different runs
        ''',
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        '--sanity-dir', type=Path, default=Path('sanity'), help='Path to sanity directory (default: ./sanity)'
    )

    subparsers = parser.add_subparsers(dest='command', help='Available commands')

    # List command
    list_parser = subparsers.add_parser(
        'list',
        help='List all sanity runs',
        description='Display all available sanity test runs with timestamps and step counts',
    )

    # Show command
    show_parser = subparsers.add_parser(
        'show',
        help='Show run details',
        description='Display detailed information about a specific sanity run including components and test steps',
    )
    show_parser.add_argument('run', help='Run name or partial name (e.g., "20250825_130529" or just "20250825")')

    # View command
    view_parser = subparsers.add_parser(
        'view',
        help='View log content',
        description='View log file content with proper formatting, ANSI color support, and optional paging',
    )
    view_parser.add_argument('run', help='Run name or partial name')
    view_parser.add_argument('--step', help='Specific step to view (e.g., "dmtx_simple"). Default: master log')
    view_parser.add_argument(
        '--lines',
        help='''Line specification for partial viewing:
  - Number: "50" (first 50 lines)
  - Range: "10:50" (lines 10 to 50)  
  - Start range: "100:" (from line 100 to end)
  - End range: ":50" (first 50 lines)''',
    )
    view_parser.add_argument(
        '--no-pager', action='store_true', help='Disable pager (less/more) and output directly to terminal'
    )

    # Search command
    search_parser = subparsers.add_parser(
        'search', help='Search in logs', description='Search for patterns in log files using regular expressions'
    )
    search_parser.add_argument('run', help='Run name or partial name')
    search_parser.add_argument('pattern', help='Search pattern (supports regex, e.g., "ERROR.*timeout")')
    search_parser.add_argument('--step', help='Specific step to search in (default: all steps)')
    search_parser.add_argument('--case-sensitive', action='store_true', help='Case-sensitive search')

    # Filter command
    filter_parser = subparsers.add_parser(
        'filter',
        help='Filter logs by level',
        description='Filter log entries by log level (INFO, DEBUG, ERROR, WARNING, etc.)',
    )
    filter_parser.add_argument('run', help='Run name or partial name')
    filter_parser.add_argument('level', help='Log level to filter by (INFO, DEBUG, ERROR, WARNING, etc.)')
    filter_parser.add_argument('--step', help='Specific step to filter (default: master log)')

    # Summary command
    summary_parser = subparsers.add_parser(
        'summary',
        help='Show step summary',
        description='''Show comprehensive summary of all test steps including:
  - Step status (PASSED/FAILED/COMPLETED/UNKNOWN)
  - Execution duration for each step
  - Test results (passed/failed counts) when available
  - Total execution time across all steps''',
    )
    summary_parser.add_argument('run', help='Run name or partial name')

    # Compare command
    compare_parser = subparsers.add_parser(
        'compare',
        help='Compare two runs',
        description='Compare two sanity runs side-by-side showing differences in components and steps',
    )
    compare_parser.add_argument('run1', help='First run name or partial name')
    compare_parser.add_argument('run2', help='Second run name or partial name')

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    viewer = SanityLogViewer(args.sanity_dir)

    if args.command == 'list':
        viewer.list_runs()
    elif args.command == 'show':
        viewer.show_run_details(args.run)
    elif args.command == 'view':
        viewer.view_log(args.run, args.step, args.lines, not args.no_pager)
    elif args.command == 'search':
        viewer.search_logs(args.run, args.pattern, args.step, args.case_sensitive)
    elif args.command == 'filter':
        viewer.filter_by_log_level(args.run, args.level, args.step)
    elif args.command == 'summary':
        viewer.show_step_summary(args.run)
    elif args.command == 'compare':
        viewer.compare_runs(args.run1, args.run2)


if __name__ == '__main__':
    main()
