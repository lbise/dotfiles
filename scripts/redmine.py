#!/usr/bin/env python3

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from typing import Optional

import requests


def _format_filesize(size_bytes: int) -> str:
    """Format a file size in bytes to a human-readable string."""
    if size_bytes > 1024 * 1024:
        return f'{size_bytes / (1024 * 1024):.1f} MB'
    elif size_bytes > 1024:
        return f'{size_bytes / 1024:.1f} KB'
    else:
        return f'{size_bytes} B'


class RedmineClient:
    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.session = requests.Session()
        self.session.headers.update(
            {'X-Redmine-API-Key': api_key, 'Content-Type': 'application/json'}
        )

    def get_issue(self, issue_id: int) -> dict:
        url = f'{self.base_url}/issues/{issue_id}.json'
        params = {'include': 'attachments,relations,journals,watchers'}

        response = self.session.get(url, params=params)
        response.raise_for_status()

        return response.json()

    def get_current_user(self) -> dict:
        url = f'{self.base_url}/users/current.json'
        response = self.session.get(url)
        response.raise_for_status()
        return response.json()

    def get_user_by_login(self, login: str) -> Optional[dict]:
        url = f'{self.base_url}/users.json'
        params = {'name': login}
        response = self.session.get(url, params=params)
        response.raise_for_status()

        data = response.json()
        users = data.get('users', [])
        for user in users:
            if user.get('login') == login:
                return user
        return None

    def get_issues_by_assigned_user(
        self,
        user_id: int,
        limit: int = 100,
        status_filter: Optional[str] = None,
        priority_filter: Optional[str] = None,
    ) -> dict:
        url = f'{self.base_url}/issues.json'
        params = {
            'assigned_to_id': str(user_id),
            'limit': str(limit),
            'sort': 'priority:desc',
        }

        # Note: Redmine API filtering by status/priority names is handled client-side
        # since the API typically expects IDs rather than names

        response = self.session.get(url, params=params)
        response.raise_for_status()
        return response.json()

    def update_issue(self, issue_id: int, status_name: str) -> dict:
        # First, get available statuses for this issue to find the status ID
        url = f'{self.base_url}/issues/{issue_id}.json'
        response = self.session.get(url)
        response.raise_for_status()

        # Get the issue to determine available status transitions
        response.json()  # We get the response but don't need to store it

        # For simplicity, we'll use a common mapping of status names to likely IDs
        # This may need to be adjusted based on your Redmine configuration
        status_mapping = {
            'new': 1,
            'in progress': 2,
            'resolved': 3,
            'feedback': 4,
            'closed': 5,
            'rejected': 6,
        }

        status_id = status_mapping.get(status_name.lower())
        if not status_id:
            raise ValueError(f'Unknown status: {status_name}')

        # Update the issue
        update_url = f'{self.base_url}/issues/{issue_id}.json'
        update_data = {'issue': {'status_id': status_id}}

        response = self.session.put(update_url, json=update_data)
        response.raise_for_status()

        return response.json() if response.content else {}

    def add_note_to_issue(self, issue_id: int, note: str) -> dict:
        # Add a note/comment to an issue
        url = f'{self.base_url}/issues/{issue_id}.json'
        update_data = {'issue': {'notes': note}}

        response = self.session.put(url, json=update_data)
        response.raise_for_status()

        return response.json() if response.content else {}

    def download_attachment(self, content_url: str, dest_path: str) -> str:
        """Download an attachment from Redmine to a local file path.

        Args:
            content_url: The download URL for the attachment.
            dest_path: The local file path to save the attachment to.

        Returns:
            The local file path where the attachment was saved.
        """
        response = self.session.get(content_url, stream=True)
        response.raise_for_status()

        os.makedirs(os.path.dirname(dest_path), exist_ok=True)

        with open(dest_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)

        return dest_path


class WorkflowManager:
    def __init__(self, redmine_url: str, api_key: str):
        self.redmine = RedmineClient(redmine_url, api_key)

    def _is_git_repository(self) -> bool:
        try:
            subprocess.run(
                ['git', 'rev-parse', '--git-dir'],
                check=True,
                capture_output=True,
                text=True,
            )
            return True
        except (subprocess.CalledProcessError, FileNotFoundError):
            return False

    def _get_current_git_branch(self) -> Optional[str]:
        try:
            result = subprocess.run(
                ['git', 'branch', '--show-current'],
                check=True,
                capture_output=True,
                text=True,
            )
            return result.stdout.strip()
        except (subprocess.CalledProcessError, FileNotFoundError):
            return None

    def _sanitize_branch_name(self, subject: str, ticket_number: int) -> str:
        # Remove special characters and replace spaces with hyphens
        sanitized = re.sub(r'[^\w\s-]', '', subject)
        sanitized = re.sub(r'\s+', '-', sanitized.strip())
        # Ensure it starts with the ticket number
        branch_name = f'{ticket_number}-{sanitized}'
        # Limit length to 32 characters without cutting words
        if len(branch_name) > 32:
            # Find the last complete word that fits
            truncated = branch_name[:32]
            # If it ends with a hyphen, that's fine
            if truncated.endswith('-'):
                branch_name = truncated.rstrip('-')
            else:
                # Find the last hyphen to avoid cutting a word
                last_hyphen = truncated.rfind('-')
                if last_hyphen > len(
                    str(ticket_number)
                ):  # Ensure we keep at least the ticket number
                    branch_name = truncated[:last_hyphen]
                else:
                    # If no good place to cut, just truncate and remove trailing hyphen
                    branch_name = truncated.rstrip('-')
        return branch_name.lower()

    def _sanitize_filename(self, subject: str, ticket_number: int) -> str:
        # Remove characters that are not allowed in filenames
        sanitized = re.sub(r'[<>:"/\\|?*]', '', subject)
        # Replace spaces with hyphens and collapse multiple hyphens
        sanitized = re.sub(r'\s+', '-', sanitized.strip())
        sanitized = re.sub(r'-+', '-', sanitized)
        # Create filename with ticket number prefix
        filename = f'{ticket_number}-{sanitized}'
        return filename

    def _create_git_branch(self, branch_name: str) -> bool:
        try:
            # Check if branch already exists
            result = subprocess.run(
                ['git', 'branch', '--list', branch_name], capture_output=True, text=True
            )
            if branch_name in result.stdout:
                # Branch exists, checkout to it
                subprocess.run(
                    ['git', 'checkout', branch_name],
                    check=True,
                    capture_output=True,
                    text=True,
                )
                print(f'✓ Switched to existing git branch: {branch_name}')
                return True

            # Create and checkout the new branch
            subprocess.run(
                ['git', 'checkout', '-b', branch_name],
                check=True,
                capture_output=True,
                text=True,
            )
            print(f'✓ Created and switched to git branch: {branch_name}')
            return True
        except subprocess.CalledProcessError as e:
            print(f'Warning: Could not create git branch - {e}', file=sys.stderr)
            return False

    def _ensure_notes_directory(self) -> str:
        notes_dir = os.path.join(os.getcwd(), 'ai_notes', 'tickets')
        os.makedirs(notes_dir, exist_ok=True)
        return notes_dir

    def _separate_journal_entries(self, journals: list) -> tuple[list, list]:
        """Separate journal entries into comments and field changes."""
        comments = []
        field_changes = []

        for journal in journals:
            # Check if this journal has user comments
            if journal.get('notes'):
                comments.append(journal)

            # Check if this journal has field changes
            if journal.get('details'):
                field_changes.append(journal)

        return comments, field_changes

    def _generate_ticket_markdown(
        self, issue_data: dict, ticket_number: int, show_history: bool = False
    ) -> str:
        issue = issue_data['issue']
        ticket_url = f'{self.redmine.base_url}/issues/{ticket_number}'

        markdown_content = f"""# Ticket #{ticket_number}: {issue['subject']}

## Details
- **URL**: {ticket_url}
- **Status**: {issue['status']['name']}
- **Priority**: {issue['priority']['name']}
- **Assigned to**: {issue.get('assigned_to', {}).get('name', 'Unassigned')}
- **Project**: {issue['project']['name']}
"""

        if issue.get('created_on'):
            markdown_content += f'- **Created**: {issue["created_on"]}\n'
        if issue.get('updated_on'):
            markdown_content += f'- **Updated**: {issue["updated_on"]}\n'

        if issue.get('description'):
            markdown_content += f'\n## Description\n{issue["description"]}\n'

        # Add custom fields if they exist
        if issue.get('custom_fields'):
            markdown_content += '\n## Custom Fields\n'
            for field in issue['custom_fields']:
                value = field.get('value', 'Not set')
                if isinstance(value, list):
                    value = ', '.join(str(v) for v in value)
                markdown_content += f'- **{field["name"]}**: {value}\n'

        # Add journals (separated into comments and field changes)
        if issue.get('journals'):
            comments, field_changes = self._separate_journal_entries(issue['journals'])

            # Add user comments
            if comments:
                markdown_content += '\n## Comments\n'
                for journal in comments:
                    user = journal.get('user', {}).get('name', 'Unknown user')
                    created_on = journal.get('created_on', 'Unknown date')
                    markdown_content += f'\n### {user} on {created_on}\n'
                    markdown_content += f'{journal["notes"]}\n'

            # Add field changes only if history is requested
            if show_history and field_changes:
                markdown_content += '\n## Field Changes\n'
                for journal in field_changes:
                    user = journal.get('user', {}).get('name', 'Unknown user')
                    created_on = journal.get('created_on', 'Unknown date')
                    markdown_content += f'\n### {user} on {created_on}\n'
                    for detail in journal['details']:
                        if detail.get('property') == 'attr':
                            field_name = detail.get('name', 'Unknown field')
                            old_value = detail.get('old_value', '')
                            new_value = detail.get('new_value', '')
                            markdown_content += f'- Changed {field_name}: "{old_value}" → "{new_value}"\n'

        # Add attachments
        if issue.get('attachments'):
            markdown_content += '\n## Attachments\n'
            for attachment in issue['attachments']:
                filename = attachment.get('filename', 'Unknown')
                content_url = attachment.get('content_url', '')
                content_type = attachment.get('content_type', '')
                filesize = attachment.get('filesize', 0)
                size_str = _format_filesize(filesize)
                markdown_content += (
                    f'- [{filename}]({content_url}) ({content_type}, {size_str})\n'
                )

        markdown_content += '\n## Work Notes\n\n<!-- Add your work notes here -->\n'

        return markdown_content

    def _write_ticket_markdown(
        self,
        issue_data: dict,
        ticket_number: int,
        ticket_subject: Optional[str] = None,
        show_history: bool = False,
    ) -> None:
        try:
            notes_dir = self._ensure_notes_directory()
            markdown_content = self._generate_ticket_markdown(
                issue_data, ticket_number, show_history
            )

            if ticket_subject:
                sanitized_filename = self._sanitize_filename(
                    ticket_subject, ticket_number
                )
                filename = f'{sanitized_filename}.md'
            else:
                filename = f'ticket_{ticket_number}.md'
            filepath = os.path.join(notes_dir, filename)

            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(markdown_content)

            print(f'✓ Created ticket notes: {filepath}')
        except Exception as e:
            print(
                f'Warning: Could not create ticket markdown file - {e}', file=sys.stderr
            )

    def view_ticket(
        self, ticket_number: int, print_url: bool = True, show_history: bool = False
    ) -> None:
        try:
            issue_data = self.redmine.get_issue(ticket_number)
            issue = issue_data['issue']

            print(f'Ticket #{ticket_number}')
            print(f'Subject: {issue["subject"]}')
            print(f'Status: {issue["status"]["name"]}')
            print(f'Priority: {issue["priority"]["name"]}')
            print(
                f'Assigned to: {issue.get("assigned_to", {}).get("name", "Unassigned")}'
            )
            print(f'Project: {issue["project"]["name"]}')

            if issue.get('created_on'):
                print(f'Created: {issue["created_on"]}')
            if issue.get('updated_on'):
                print(f'Updated: {issue["updated_on"]}')

            if issue.get('description'):
                print(f'\nDescription:\n{issue["description"]}')

            # Display custom fields
            if issue.get('custom_fields'):
                print('\nCustom Fields:')
                for field in issue['custom_fields']:
                    value = field.get('value', 'Not set')
                    if isinstance(value, list):
                        value = ', '.join(str(v) for v in value)
                    print(f'  {field["name"]}: {value}')

            # Display journals (separated into comments and field changes)
            if issue.get('journals'):
                comments, field_changes = self._separate_journal_entries(
                    issue['journals']
                )

                # Display user comments
                if comments:
                    print('\nComments:')
                    for journal in comments:
                        user = journal.get('user', {}).get('name', 'Unknown user')
                        created_on = journal.get('created_on', 'Unknown date')
                        print(f'\n--- {user} on {created_on} ---')
                        print(journal['notes'])

                # Display field changes only if history is requested
                if show_history and field_changes:
                    print('\nField Changes:')
                    for journal in field_changes:
                        user = journal.get('user', {}).get('name', 'Unknown user')
                        created_on = journal.get('created_on', 'Unknown date')
                        print(f'\n--- {user} on {created_on} ---')
                        for detail in journal['details']:
                            if detail.get('property') == 'attr':
                                field_name = detail.get('name', 'Unknown field')
                                old_value = detail.get('old_value', '')
                                new_value = detail.get('new_value', '')
                                print(
                                    f'  Changed {field_name}: "{old_value}" → "{new_value}"'
                                )

            # Display attachments
            if issue.get('attachments'):
                print('\nAttachments:')
                for attachment in issue['attachments']:
                    filename = attachment.get('filename', 'Unknown')
                    content_type = attachment.get('content_type', 'Unknown')
                    filesize = attachment.get('filesize', 0)
                    content_url = attachment.get('content_url', '')
                    size_str = _format_filesize(filesize)
                    print(f'  {filename} ({content_type}, {size_str}): {content_url}')

        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 404:
                print(f'Error: Ticket #{ticket_number} not found', file=sys.stderr)
            elif e.response.status_code == 401:
                print(
                    'Error: Authentication failed. Check your API key', file=sys.stderr
                )
            else:
                print(
                    f'Error: HTTP {e.response.status_code} - {e.response.text}',
                    file=sys.stderr,
                )
            sys.exit(1)
        except requests.exceptions.RequestException as e:
            print(f'Error: Failed to connect to Redmine server - {e}', file=sys.stderr)
            sys.exit(1)

        # Print ticket URL for easy access (if requested)
        if print_url:
            self._print_ticket_url(ticket_number)

    def _print_ticket_url(self, ticket_number: int) -> None:
        """Print the ticket URL for easy access."""
        ticket_url = f'{self.redmine.base_url}/issues/{ticket_number}'
        print(f'\n🔗 Ticket URL: {ticket_url}')

    def start_ticket(self, ticket_number: int) -> None:
        print(f'Starting work on ticket #{ticket_number}')

        # Get ticket information first to get the subject and full data
        try:
            issue_data = self.redmine.get_issue(ticket_number)
            issue = issue_data['issue']
            ticket_subject = issue['subject']
        except Exception as e:
            print(f'Error: Could not fetch ticket information - {e}', file=sys.stderr)
            sys.exit(1)

        self.view_ticket(ticket_number, print_url=False)

        # Create git branch and markdown file only if in a git repository
        if self._is_git_repository():
            branch_name = self._sanitize_branch_name(ticket_subject, ticket_number)
            print(f'\nDetected git repository. Creating branch: {branch_name}')
            if self._create_git_branch(branch_name):
                print('\nCreating ticket notes markdown file...')
                self._write_ticket_markdown(issue_data, ticket_number, ticket_subject)
            else:
                print(
                    'Warning: Could not create or switch to git branch',
                    file=sys.stderr,
                )
        else:
            print(
                '\nNot in a git repository. Skipping branch and markdown file creation.'
            )

        # Update ticket status to "In Progress"
        try:
            print(f'\nUpdating ticket #{ticket_number} status to "In Progress"...')
            self.redmine.update_issue(ticket_number, 'in progress')
            print(f'✓ Ticket #{ticket_number} status updated to "In Progress"')
        except ValueError as e:
            print(f'Warning: Could not update ticket status - {e}', file=sys.stderr)
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 422:
                print(
                    'Warning: Could not update ticket status - invalid status transition',
                    file=sys.stderr,
                )
            else:
                print(
                    f'Warning: Could not update ticket status - HTTP {e.response.status_code}',
                    file=sys.stderr,
                )
        except requests.exceptions.RequestException as e:
            print(f'Warning: Could not update ticket status - {e}', file=sys.stderr)

        # Print ticket URL for easy access
        self._print_ticket_url(ticket_number)

    def summary_tickets(
        self,
        username: Optional[str] = None,
        status_filter: Optional[str] = None,
        priority_filter: Optional[str] = None,
    ) -> None:
        try:
            if username:
                print(
                    'Warning: User lookup by username is not supported due to API restrictions. Using current user instead.',
                    file=sys.stderr,
                )

            # Always use current user from API since user lookup by name is forbidden
            current_user_data = self.redmine.get_current_user()
            user_data = current_user_data['user']
            user_id = user_data['id']
            display_name = f'{user_data.get("firstname", "")} {user_data.get("lastname", "")}'.strip()
            if not display_name:
                display_name = user_data.get('login', 'Unknown User')

            # Get issues assigned to the user
            issues_data = self.redmine.get_issues_by_assigned_user(
                user_id, status_filter=status_filter, priority_filter=priority_filter
            )
            issues = issues_data.get('issues', [])

            # Parse comma-separated filters
            status_list = []
            if status_filter:
                status_list = [
                    s.strip().lower() for s in status_filter.split(',') if s.strip()
                ]

            priority_list = []
            if priority_filter:
                priority_list = [
                    p.strip().lower() for p in priority_filter.split(',') if p.strip()
                ]

            # Apply client-side filtering since Redmine API filtering by name is complex
            if status_list:
                issues = [
                    issue
                    for issue in issues
                    if issue['status']['name'].lower() in status_list
                ]

            if priority_list:
                issues = [
                    issue
                    for issue in issues
                    if issue['priority']['name'].lower() in priority_list
                ]

            # Sort issues by status name
            issues.sort(key=lambda issue: issue['status']['name'])

            if not issues:
                filter_desc = ''
                if status_list or priority_list:
                    filters = []
                    if status_list:
                        status_names = ', '.join(f'"{s}"' for s in status_list)
                        filters.append(f'status in [{status_names}]')
                    if priority_list:
                        priority_names = ', '.join(f'"{p}"' for p in priority_list)
                        filters.append(f'priority in [{priority_names}]')
                    filter_desc = f' with filters: {", ".join(filters)}'
                print(f'No tickets assigned to {display_name}{filter_desc}')
                return

            filter_desc = ''
            if status_list or priority_list:
                filters = []
                if status_list:
                    status_names = ', '.join(f'"{s}"' for s in status_list)
                    filters.append(f'status in [{status_names}]')
                if priority_list:
                    priority_names = ', '.join(f'"{p}"' for p in priority_list)
                    filters.append(f'priority in [{priority_names}]')
                filter_desc = f' (filtered by {", ".join(filters)})'

            print(f'Tickets assigned to {display_name}{filter_desc}:')
            print(f'{"ID":<8} {"Status":<15} {"Priority":<10} {"Subject"}')
            print('-' * 80)

            for issue in issues:
                issue_id = issue['id']
                status = issue['status']['name']
                priority = issue['priority']['name']
                subject = issue['subject']

                # Truncate subject if too long for display
                if len(subject) > 45:
                    subject = subject[:42] + '...'

                print(f'#{issue_id:<7} {status:<15} {priority:<10} {subject}')

            print('-' * 80)
            print(f'Total: {len(issues)} ticket{"s" if len(issues) != 1 else ""}')

        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 401:
                print(
                    'Error: Authentication failed. Check your API key', file=sys.stderr
                )
            else:
                print(
                    f'Error: HTTP {e.response.status_code} - {e.response.text}',
                    file=sys.stderr,
                )
            sys.exit(1)
        except requests.exceptions.RequestException as e:
            print(f'Error: Failed to connect to Redmine server - {e}', file=sys.stderr)
            sys.exit(1)

    def generate_report(self, output_format: str = 'html') -> None:
        try:
            # Always use current user from API
            current_user_data = self.redmine.get_current_user()
            user_data = current_user_data['user']
            user_id = user_data['id']
            display_name = f'{user_data.get("firstname", "")} {user_data.get("lastname", "")}'.strip()
            if not display_name:
                display_name = user_data.get('login', 'Unknown User')

            # Get issues assigned to the user
            issues_data = self.redmine.get_issues_by_assigned_user(user_id)
            issues = issues_data.get('issues', [])

            # Filter for In Progress and Resolved status
            report_statuses = ['in progress', 'resolved']
            filtered_issues = [
                issue
                for issue in issues
                if issue['status']['name'].lower() in report_statuses
            ]

            if not filtered_issues:
                if output_format == 'markdown':
                    print(
                        'No tickets with "In Progress" or "Resolved" status found.'
                    )
                else:
                    print(
                        '<p>No tickets with "In Progress" or "Resolved" status found.</p>'
                    )
                return

            if output_format == 'markdown':
                self._generate_report_markdown(filtered_issues)
            else:
                self._generate_report_html(filtered_issues)

        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 401:
                print(
                    'Error: Authentication failed. Check your API key', file=sys.stderr
                )
            else:
                print(
                    f'Error: HTTP {e.response.status_code} - {e.response.text}',
                    file=sys.stderr,
                )
            sys.exit(1)
        except requests.exceptions.RequestException as e:
            print(f'Error: Failed to connect to Redmine server - {e}', file=sys.stderr)
            sys.exit(1)

    def _generate_report_html(self, issues: list) -> None:
        print('<h3>LeB (5d)</h3>')
        print('<ul>')
        for issue in issues:
            issue_id = issue['id']
            subject = issue['subject']
            ticket_url = f'{self.redmine.base_url}/issues/{issue_id}'

            print(f'<li>{subject} (<a href="{ticket_url}">#{issue_id}</a>)</li>')

        print('</ul>')

    def _generate_report_markdown(self, issues: list) -> None:
        print('### LeB (5d)')
        print()
        for issue in issues:
            issue_id = issue['id']
            subject = issue['subject']
            ticket_url = f'{self.redmine.base_url}/issues/{issue_id}'

            print(f'- {subject} ([#{issue_id}]({ticket_url}))')
        print()

    def add_note(self, ticket_number: int, note: str) -> None:
        try:
            print(f'Adding note to ticket #{ticket_number}...')
            self.redmine.add_note_to_issue(ticket_number, note)
            print(f'✓ Note added to ticket #{ticket_number}')
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 404:
                print(f'Error: Ticket #{ticket_number} not found', file=sys.stderr)
            elif e.response.status_code == 401:
                print(
                    'Error: Authentication failed. Check your API key', file=sys.stderr
                )
            elif e.response.status_code == 422:
                print('Error: Could not add note - invalid request', file=sys.stderr)
            else:
                print(
                    f'Error: HTTP {e.response.status_code} - {e.response.text}',
                    file=sys.stderr,
                )
            sys.exit(1)
        except requests.exceptions.RequestException as e:
            print(f'Error: Failed to connect to Redmine server - {e}', file=sys.stderr)
            sys.exit(1)

        # Print ticket URL for easy access
        self._print_ticket_url(ticket_number)

    def set_ticket_status(self, ticket_number: int, status: str) -> None:
        try:
            print(f'Setting ticket #{ticket_number} status to "{status}"...')
            self.redmine.update_issue(ticket_number, status)
            print(f'✓ Ticket #{ticket_number} status updated to "{status}"')
        except ValueError as e:
            print(f'Error: {e}', file=sys.stderr)
            print(
                'Available statuses: new, in progress, resolved, feedback, closed, rejected',
                file=sys.stderr,
            )
            sys.exit(1)
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 404:
                print(f'Error: Ticket #{ticket_number} not found', file=sys.stderr)
            elif e.response.status_code == 401:
                print(
                    'Error: Authentication failed. Check your API key', file=sys.stderr
                )
            elif e.response.status_code == 422:
                print(
                    'Error: Could not update ticket status - invalid status transition',
                    file=sys.stderr,
                )
            else:
                print(
                    f'Error: HTTP {e.response.status_code} - {e.response.text}',
                    file=sys.stderr,
                )
            sys.exit(1)
        except requests.exceptions.RequestException as e:
            print(f'Error: Failed to connect to Redmine server - {e}', file=sys.stderr)
            sys.exit(1)

        # Print ticket URL for easy access
        self._print_ticket_url(ticket_number)

    def download_attachments(
        self,
        ticket_number: int,
        filename_filter: Optional[str] = None,
        dest_dir: Optional[str] = None,
    ) -> None:
        """Download attachment(s) from a Redmine ticket.

        Args:
            ticket_number: The Redmine ticket number.
            filename_filter: Optional substring to filter attachments by filename.
            dest_dir: Optional destination directory. Defaults to /tmp/redmine_attachments/<ticket_number>/.
        """
        try:
            issue_data = self.redmine.get_issue(ticket_number)
            issue = issue_data['issue']
            attachments = issue.get('attachments', [])

            if not attachments:
                print(f'No attachments found on ticket #{ticket_number}')
                return

            # Filter by filename if specified
            if filename_filter:
                attachments = [
                    a
                    for a in attachments
                    if filename_filter.lower() in a.get('filename', '').lower()
                ]
                if not attachments:
                    print(
                        f'No attachments matching "{filename_filter}" found on ticket #{ticket_number}'
                    )
                    return

            # Determine destination directory
            if not dest_dir:
                dest_dir = os.path.join(
                    '/tmp', 'redmine_attachments', str(ticket_number)
                )

            os.makedirs(dest_dir, exist_ok=True)

            print(
                f'Downloading {len(attachments)} attachment(s) from ticket #{ticket_number}...'
            )

            for attachment in attachments:
                filename = attachment.get('filename', 'unknown')
                content_url = attachment.get('content_url', '')
                filesize = attachment.get('filesize', 0)
                size_str = _format_filesize(filesize)

                if not content_url:
                    print(f'  Skipping {filename}: no download URL available')
                    continue

                dest_path = os.path.join(dest_dir, filename)

                try:
                    self.redmine.download_attachment(content_url, dest_path)
                    print(f'  Downloaded: {dest_path} ({size_str})')
                except requests.exceptions.HTTPError as e:
                    print(
                        f'  Failed to download {filename}: HTTP {e.response.status_code}',
                        file=sys.stderr,
                    )
                except requests.exceptions.RequestException as e:
                    print(
                        f'  Failed to download {filename}: {e}', file=sys.stderr
                    )

        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 404:
                print(f'Error: Ticket #{ticket_number} not found', file=sys.stderr)
            elif e.response.status_code == 401:
                print(
                    'Error: Authentication failed. Check your API key', file=sys.stderr
                )
            else:
                print(
                    f'Error: HTTP {e.response.status_code} - {e.response.text}',
                    file=sys.stderr,
                )
            sys.exit(1)
        except requests.exceptions.RequestException as e:
            print(f'Error: Failed to connect to Redmine server - {e}', file=sys.stderr)
            sys.exit(1)


def get_api_key(args_api_key: Optional[str]) -> str:
    if args_api_key:
        return args_api_key

    env_api_key = os.getenv('REDMINE_API_KEY')
    if env_api_key:
        return env_api_key

    print(
        'Error: No API key provided. Use --api-key or set REDMINE_API_KEY environment variable',
        file=sys.stderr,
    )
    sys.exit(1)


def get_redmine_url() -> str:
    redmine_url = os.getenv('REDMINE_URL')
    if not redmine_url:
        print('Error: REDMINE_URL environment variable is required', file=sys.stderr)
        sys.exit(1)
    return redmine_url


def main():
    parser = argparse.ArgumentParser(description='Redmine tool')
    subparsers = parser.add_subparsers(dest='command', help='Available commands')

    start_parser = subparsers.add_parser('start', help='Start work on a ticket')
    start_parser.add_argument('ticket_number', type=int, help='Redmine ticket number')
    start_parser.add_argument(
        '--api-key', help='Redmine API key (or use REDMINE_API_KEY env var)'
    )

    view_parser = subparsers.add_parser('view', help='View ticket details')
    view_parser.add_argument('ticket_number', type=int, help='Redmine ticket number')
    view_parser.add_argument(
        '--history',
        action='store_true',
        help='Show field change history in addition to comments',
    )
    view_parser.add_argument(
        '--api-key', help='Redmine API key (or use REDMINE_API_KEY env var)'
    )

    summary_parser = subparsers.add_parser(
        'summary', help='Show tickets assigned to user'
    )
    summary_parser.add_argument(
        '--user',
        help='Username to show tickets for (default: USER env var or current user)',
    )
    summary_parser.add_argument(
        '--status',
        help='Filter by status (e.g., "New", "In Progress,Resolved", "Closed"). Use commas to specify multiple statuses.',
    )
    summary_parser.add_argument(
        '--priority',
        help='Filter by priority (e.g., "Low", "Normal,High", "Urgent"). Use commas to specify multiple priorities.',
    )
    summary_parser.add_argument(
        '--api-key', help='Redmine API key (or use REDMINE_API_KEY env var)'
    )

    report_parser = subparsers.add_parser(
        'report',
        help='Generate weekly report for In Progress and Resolved tickets',
    )
    report_parser.add_argument(
        '--format',
        choices=['html', 'markdown'],
        default='html',
        help='Output format for the report (default: html)',
    )
    report_parser.add_argument(
        '--api-key', help='Redmine API key (or use REDMINE_API_KEY env var)'
    )

    note_parser = subparsers.add_parser('note', help='Add a note to a ticket')
    note_parser.add_argument('ticket_number', type=int, help='Redmine ticket number')
    note_parser.add_argument('note', help='Note text to add to the ticket')
    note_parser.add_argument(
        '--api-key', help='Redmine API key (or use REDMINE_API_KEY env var)'
    )

    set_status_parser = subparsers.add_parser(
        'set-status', help='Set ticket status directly'
    )
    set_status_parser.add_argument(
        'ticket_number', type=int, help='Redmine ticket number'
    )
    set_status_parser.add_argument(
        'status',
        help='Target status (e.g., "new", "in progress", "resolved", "closed")',
    )
    set_status_parser.add_argument(
        '--api-key', help='Redmine API key (or use REDMINE_API_KEY env var)'
    )

    dl_parser = subparsers.add_parser(
        'download-attachment',
        help='Download attachment(s) from a ticket',
    )
    dl_parser.add_argument('ticket_number', type=int, help='Redmine ticket number')
    dl_parser.add_argument(
        '--filename',
        help='Filter attachments by filename (substring match)',
    )
    dl_parser.add_argument(
        '--dest',
        help='Destination directory (default: /tmp/redmine_attachments/<ticket>/)',
    )
    dl_parser.add_argument(
        '--api-key', help='Redmine API key (or use REDMINE_API_KEY env var)'
    )

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    api_key = get_api_key(args.api_key)
    redmine_url = get_redmine_url()
    workflow = WorkflowManager(redmine_url, api_key)

    if args.command == 'start':
        workflow.start_ticket(args.ticket_number)
    elif args.command == 'view':
        workflow.view_ticket(args.ticket_number, show_history=args.history)
    elif args.command == 'summary':
        workflow.summary_tickets(
            args.user, getattr(args, 'status', None), getattr(args, 'priority', None)
        )
    elif args.command == 'report':
        workflow.generate_report(output_format=args.format)
    elif args.command == 'note':
        workflow.add_note(args.ticket_number, args.note)
    elif args.command == 'set-status':
        workflow.set_ticket_status(args.ticket_number, args.status)
    elif args.command == 'download-attachment':
        workflow.download_attachments(
            args.ticket_number,
            filename_filter=args.filename,
            dest_dir=args.dest,
        )


if __name__ == '__main__':
    main()
