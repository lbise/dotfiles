#!/usr/bin/env python3
"""
Redmine CLI - Pure API wrapper for Redmine ticket management.

This tool provides direct access to Redmine operations without side effects.
No git operations, no filesystem changes - just Redmine API calls.
"""

from __future__ import annotations

import argparse
import os
import sys
from typing import Optional

import requests


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

    def resolve_user_id(self, assigned_to: str) -> int:
        """Resolve a login name or numeric string to a Redmine user ID."""
        if assigned_to.isdigit():
            return int(assigned_to)
        current = self.get_current_user()['user']
        if current.get('login') == assigned_to:
            return current['id']
        # Fall back to users search (requires Redmine admin or manager role)
        url = f'{self.base_url}/users.json'
        response = self.session.get(url, params={'name': assigned_to})
        response.raise_for_status()
        users = response.json().get('users', [])
        for user in users:
            if user.get('login') == assigned_to:
                return user['id']
        raise ValueError(f'Could not resolve user: {assigned_to!r}')

    def get_issues_by_assigned_user(
        self,
        user_id: int,
        limit: int = 100,
    ) -> dict:
        url = f'{self.base_url}/issues.json'
        params = {
            'assigned_to_id': str(user_id),
            'limit': str(limit),
            'sort': 'priority:desc',
        }

        response = self.session.get(url, params=params)
        response.raise_for_status()
        return response.json()

    def update_issue(self, issue_id: int, status_name: str) -> dict:
        # Status name to ID mapping - may need adjustment per Redmine instance
        status_mapping = {
            'new': 1,
            'in progress': 2,
            'resolved': 3,
            'feedback': 4,
            'closed': 5,
            'rejected': 6,
            'monitoring': 7,
        }

        status_id = status_mapping.get(status_name.lower())
        if not status_id:
            raise ValueError(
                f'Unknown status: {status_name}. '
                f'Available: {", ".join(status_mapping.keys())}'
            )

        url = f'{self.base_url}/issues/{issue_id}.json'
        update_data = {'issue': {'status_id': status_id}}

        response = self.session.put(url, json=update_data)
        response.raise_for_status()

        return response.json() if response.content else {}

    def add_note_to_issue(self, issue_id: int, note: str) -> dict:
        url = f'{self.base_url}/issues/{issue_id}.json'
        update_data = {'issue': {'notes': note}}

        response = self.session.put(url, json=update_data)
        response.raise_for_status()

        return response.json() if response.content else {}

    def update_description(self, issue_id: int, description: str) -> dict:
        """Update the issue description."""
        url = f'{self.base_url}/issues/{issue_id}.json'
        update_data = {'issue': {'description': description}}

        response = self.session.put(url, json=update_data)
        response.raise_for_status()

        return response.json() if response.content else {}

    def update_custom_field(self, issue_id: int, field_name: str, value: str) -> dict:
        """Update a custom field by name."""
        # First, get the issue to find the custom field ID
        issue_data = self.get_issue(issue_id)
        issue = issue_data['issue']

        field_id = None
        for field in issue.get('custom_fields', []):
            if field['name'].lower() == field_name.lower():
                field_id = field['id']
                break

        if field_id is None:
            raise ValueError(f'Custom field "{field_name}" not found in ticket #{issue_id}')

        url = f'{self.base_url}/issues/{issue_id}.json'
        update_data = {
            'issue': {
                'custom_fields': [
                    {'id': field_id, 'value': value}
                ]
            }
        }

        response = self.session.put(url, json=update_data)
        response.raise_for_status()

        return response.json() if response.content else {}

    def download_attachment(self, content_url: str, output_path: str) -> str:
        """Download an attachment from its content_url to a local file."""
        response = self.session.get(content_url, stream=True)
        response.raise_for_status()

        with open(output_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)

        return output_path

    def create_issue(
        self,
        project: str,
        subject: str,
        description: str = '',
        assigned_to: Optional[str] = None,
        priority: Optional[str] = None,
        parent: Optional[int] = None,
        category: Optional[str] = None,
        custom_fields: Optional[dict] = None,
    ) -> dict:
        """Create a new issue."""
        # Priority name to ID mapping
        priority_mapping = {
            'low': 1,
            'normal': 2,
            'high': 3,
            'urgent': 4,
            'immediate': 5,
        }

        url = f'{self.base_url}/issues.json'
        issue_data = {
            'project_id': project,
            'subject': subject,
            'description': description,
        }

        if assigned_to:
            issue_data['assigned_to_id'] = self.resolve_user_id(assigned_to)

        if priority:
            priority_id = priority_mapping.get(priority.lower())
            if priority_id:
                issue_data['priority_id'] = priority_id

        if parent:
            issue_data['parent_issue_id'] = parent

        if category:
            issue_data['category_id'] = category

        if custom_fields:
            # Get available custom fields from the project
            # We'll need to look up field IDs by name
            issue_data['custom_fields'] = []
            for field_name, field_value in custom_fields.items():
                # For now, we'll add fields by name and let Redmine resolve them
                # In a more robust implementation, we'd fetch field IDs first
                issue_data['custom_fields'].append({
                    'name': field_name,
                    'value': field_value
                })

        create_data = {'issue': issue_data}

        response = self.session.post(url, json=create_data)
        response.raise_for_status()

        return response.json()


def _separate_journal_entries(journals: list) -> tuple[list, list]:
    """Separate journal entries into comments and field changes."""
    comments = []
    field_changes = []

    for journal in journals:
        if journal.get('notes'):
            comments.append(journal)
        if journal.get('details'):
            field_changes.append(journal)

    return comments, field_changes


def cmd_view(client: RedmineClient, args) -> None:
    """View ticket details."""
    try:
        issue_data = client.get_issue(args.ticket_number)
        issue = issue_data['issue']

        print(f'Ticket #{args.ticket_number}')
        print(f'Subject: {issue["subject"]}')
        print(f'Status: {issue["status"]["name"]}')
        print(f'Priority: {issue["priority"]["name"]}')
        print(f'Assigned to: {issue.get("assigned_to", {}).get("name", "Unassigned")}')
        print(f'Project: {issue["project"]["name"]}')

        if issue.get('created_on'):
            print(f'Created: {issue["created_on"]}')
        if issue.get('updated_on'):
            print(f'Updated: {issue["updated_on"]}')

        if issue.get('description'):
            print(f'\nDescription:\n{issue["description"]}')

        if issue.get('custom_fields'):
            print('\nCustom Fields:')
            for field in issue['custom_fields']:
                value = field.get('value', 'Not set')
                if isinstance(value, list):
                    value = ', '.join(str(v) for v in value)
                print(f'  {field["name"]}: {value}')

        if issue.get('attachments'):
            print('\nAttachments:')
            for att in issue['attachments']:
                size_kb = att['filesize'] / 1024
                print(f'  [{att["id"]}] {att["filename"]} ({size_kb:.1f} KB) - {att["content_url"]}')

        if issue.get('journals'):
            comments, field_changes = _separate_journal_entries(issue['journals'])

            if comments:
                print('\nComments:')
                for journal in comments:
                    user = journal.get('user', {}).get('name', 'Unknown user')
                    created_on = journal.get('created_on', 'Unknown date')
                    print(f'\n--- {user} on {created_on} ---')
                    print(journal['notes'])

            if args.history and field_changes:
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
                            print(f'  {field_name}: "{old_value}" -> "{new_value}"')

        # Display relations (parent/subtasks/related issues)
        if issue.get('relations'):
            parent_issues = []
            subtasks = []
            related_issues = []

            for relation in issue['relations']:
                rel_type = relation.get('relation_type')
                # For 'parent' relations, issue_to_id is the parent; issue_id is the child
                # For other relations, issue_id is the source, issue_to_id is the target

                if rel_type == 'parent':
                    parent_issues.append(relation.get('issue_to_id'))
                elif rel_type == 'subtask':
                    subtasks.append(relation.get('issue_to_id'))
                elif rel_type == 'relates':
                    # For relates, show both directions
                    if relation.get('issue_id') == args.ticket_number:
                        related_issues.append(('relates to', relation.get('issue_to_id')))
                    else:
                        related_issues.append(('related from', relation.get('issue_id')))

            if parent_issues:
                print(f'\nParent Issues:')
                for issue_id in parent_issues:
                    print(f'  #{issue_id}')

            if subtasks:
                print(f'\nSubtasks:')
                for issue_id in subtasks:
                    print(f'  #{issue_id}')

            if related_issues:
                print(f'\nRelated Issues:')
                for rel_text, issue_id in related_issues:
                    print(f'  #{issue_id} ({rel_text})')

        ticket_url = f'{client.base_url}/issues/{args.ticket_number}'
        print(f'\nURL: {ticket_url}')

    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 404:
            print(f'Error: Ticket #{args.ticket_number} not found', file=sys.stderr)
        elif e.response.status_code == 401:
            print('Error: Authentication failed. Check your API key', file=sys.stderr)
        else:
            print(f'Error: HTTP {e.response.status_code}', file=sys.stderr)
        sys.exit(1)
    except requests.exceptions.RequestException as e:
        print(f'Error: Failed to connect to Redmine - {e}', file=sys.stderr)
        sys.exit(1)


def cmd_summary(client: RedmineClient, args) -> None:
    """List tickets assigned to current user."""
    try:
        current_user_data = client.get_current_user()
        user_data = current_user_data['user']
        user_id = user_data['id']
        display_name = f'{user_data.get("firstname", "")} {user_data.get("lastname", "")}'.strip()
        if not display_name:
            display_name = user_data.get('login', 'Unknown User')

        issues_data = client.get_issues_by_assigned_user(user_id)
        issues = issues_data.get('issues', [])

        # Apply filters
        if args.status:
            status_list = [s.strip().lower() for s in args.status.split(',')]
            issues = [i for i in issues if i['status']['name'].lower() in status_list]

        if args.priority:
            priority_list = [p.strip().lower() for p in args.priority.split(',')]
            issues = [i for i in issues if i['priority']['name'].lower() in priority_list]

        issues.sort(key=lambda i: i['status']['name'])

        if not issues:
            print(f'No tickets assigned to {display_name}')
            return

        print(f'Tickets assigned to {display_name}:')
        print(f'{"ID":<8} {"Status":<15} {"Priority":<10} {"Subject"}')
        print('-' * 80)

        for issue in issues:
            subject = issue['subject']
            if len(subject) > 45:
                subject = subject[:42] + '...'
            print(f'#{issue["id"]:<7} {issue["status"]["name"]:<15} {issue["priority"]["name"]:<10} {subject}')

        print('-' * 80)
        print(f'Total: {len(issues)} ticket{"s" if len(issues) != 1 else ""}')

    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 401:
            print('Error: Authentication failed. Check your API key', file=sys.stderr)
        else:
            print(f'Error: HTTP {e.response.status_code}', file=sys.stderr)
        sys.exit(1)
    except requests.exceptions.RequestException as e:
        print(f'Error: Failed to connect to Redmine - {e}', file=sys.stderr)
        sys.exit(1)


def cmd_note(client: RedmineClient, args) -> None:
    """Add a note to a ticket."""
    try:
        client.add_note_to_issue(args.ticket_number, args.note)
        print(f'Note added to ticket #{args.ticket_number}')

        ticket_url = f'{client.base_url}/issues/{args.ticket_number}'
        print(f'URL: {ticket_url}')

    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 404:
            print(f'Error: Ticket #{args.ticket_number} not found', file=sys.stderr)
        elif e.response.status_code == 401:
            print('Error: Authentication failed. Check your API key', file=sys.stderr)
        else:
            print(f'Error: HTTP {e.response.status_code}', file=sys.stderr)
        sys.exit(1)
    except requests.exceptions.RequestException as e:
        print(f'Error: Failed to connect to Redmine - {e}', file=sys.stderr)
        sys.exit(1)


def cmd_set_status(client: RedmineClient, args) -> None:
    """Set ticket status."""
    try:
        client.update_issue(args.ticket_number, args.status)
        print(f'Ticket #{args.ticket_number} status set to "{args.status}"')

        ticket_url = f'{client.base_url}/issues/{args.ticket_number}'
        print(f'URL: {ticket_url}')

    except ValueError as e:
        print(f'Error: {e}', file=sys.stderr)
        sys.exit(1)
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 404:
            print(f'Error: Ticket #{args.ticket_number} not found', file=sys.stderr)
        elif e.response.status_code == 401:
            print('Error: Authentication failed. Check your API key', file=sys.stderr)
        elif e.response.status_code == 422:
            print('Error: Invalid status transition', file=sys.stderr)
        else:
            print(f'Error: HTTP {e.response.status_code}', file=sys.stderr)
        sys.exit(1)
    except requests.exceptions.RequestException as e:
        print(f'Error: Failed to connect to Redmine - {e}', file=sys.stderr)
        sys.exit(1)


def cmd_set_field(client: RedmineClient, args) -> None:
    """Set a custom field value."""
    try:
        client.update_custom_field(args.ticket_number, args.field_name, args.value)
        print(f'Ticket #{args.ticket_number} field "{args.field_name}" updated')

        ticket_url = f'{client.base_url}/issues/{args.ticket_number}'
        print(f'URL: {ticket_url}')

    except ValueError as e:
        print(f'Error: {e}', file=sys.stderr)
        sys.exit(1)
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 404:
            print(f'Error: Ticket #{args.ticket_number} not found', file=sys.stderr)
        elif e.response.status_code == 401:
            print('Error: Authentication failed. Check your API key', file=sys.stderr)
        elif e.response.status_code == 422:
            print('Error: Invalid field update', file=sys.stderr)
        else:
            print(f'Error: HTTP {e.response.status_code}', file=sys.stderr)
        sys.exit(1)
    except requests.exceptions.RequestException as e:
        print(f'Error: Failed to connect to Redmine - {e}', file=sys.stderr)
        sys.exit(1)


def cmd_set_description(client: RedmineClient, args) -> None:
    """Set ticket description."""
    try:
        client.update_description(args.ticket_number, args.description)
        print(f'Ticket #{args.ticket_number} description updated')

        ticket_url = f'{client.base_url}/issues/{args.ticket_number}'
        print(f'URL: {ticket_url}')

    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 404:
            print(f'Error: Ticket #{args.ticket_number} not found', file=sys.stderr)
        elif e.response.status_code == 401:
            print('Error: Authentication failed. Check your API key', file=sys.stderr)
        elif e.response.status_code == 422:
            print('Error: Invalid description update', file=sys.stderr)
        else:
            print(f'Error: HTTP {e.response.status_code}', file=sys.stderr)
        sys.exit(1)
    except requests.exceptions.RequestException as e:
        print(f'Error: Failed to connect to Redmine - {e}', file=sys.stderr)
        sys.exit(1)


def cmd_attachment(client: RedmineClient, args) -> None:
    """Download an attachment from a ticket."""
    try:
        issue_data = client.get_issue(args.ticket_number)
        issue = issue_data['issue']
        attachments = issue.get('attachments', [])

        if not attachments:
            print(f'No attachments on ticket #{args.ticket_number}')
            return

        # Find matching attachment(s)
        if args.filename:
            matches = [a for a in attachments if a['filename'] == args.filename]
            if not matches:
                print(f'Attachment "{args.filename}" not found. Available:', file=sys.stderr)
                for att in attachments:
                    print(f'  {att["filename"]}', file=sys.stderr)
                sys.exit(1)
        elif args.attachment_id:
            matches = [a for a in attachments if a['id'] == args.attachment_id]
            if not matches:
                print(f'Attachment ID {args.attachment_id} not found.', file=sys.stderr)
                sys.exit(1)
        else:
            # Download all attachments
            matches = attachments

        output_dir = args.output_dir or '.'
        for att in matches:
            output_path = os.path.join(output_dir, att['filename'])
            client.download_attachment(att['content_url'], output_path)
            size_kb = att['filesize'] / 1024
            print(f'Downloaded: {output_path} ({size_kb:.1f} KB)')

    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 404:
            print(f'Error: Ticket #{args.ticket_number} not found', file=sys.stderr)
        elif e.response.status_code == 401:
            print('Error: Authentication failed. Check your API key', file=sys.stderr)
        else:
            print(f'Error: HTTP {e.response.status_code}', file=sys.stderr)
        sys.exit(1)
    except requests.exceptions.RequestException as e:
        print(f'Error: Failed to connect to Redmine - {e}', file=sys.stderr)
        sys.exit(1)


def cmd_report(client: RedmineClient, args) -> None:
    """Generate HTML report of active tickets."""
    try:
        current_user_data = client.get_current_user()
        user_id = current_user_data['user']['id']

        issues_data = client.get_issues_by_assigned_user(user_id)
        issues = issues_data.get('issues', [])

        report_statuses = ['in progress', 'resolved']
        filtered = [i for i in issues if i['status']['name'].lower() in report_statuses]

        if not filtered:
            print('<p>No tickets with "In Progress" or "Resolved" status.</p>')
            return

        print('<h3>LeB (5d)</h3>')
        print('<ul>')
        for issue in filtered:
            ticket_url = f'{client.base_url}/issues/{issue["id"]}'
            print(f'<li>{issue["subject"]} (<a href="{ticket_url}">#{issue["id"]}</a>)</li>')
        print('</ul>')

    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 401:
            print('Error: Authentication failed. Check your API key', file=sys.stderr)
        else:
            print(f'Error: HTTP {e.response.status_code}', file=sys.stderr)
        sys.exit(1)
    except requests.exceptions.RequestException as e:
        print(f'Error: Failed to connect to Redmine - {e}', file=sys.stderr)
        sys.exit(1)


def cmd_create_ticket(client: RedmineClient, args) -> None:
    """Create a new ticket."""
    try:
        # Collect custom fields if provided
        custom_fields = None
        if args.custom_field:
            custom_fields = {}
            for field_name, field_value in args.custom_field:
                custom_fields[field_name] = field_value

        result = client.create_issue(
            project=args.project,
            subject=args.subject,
            description=args.description,
            assigned_to=args.assigned_to,
            priority=args.priority,
            parent=args.parent,
            category=args.category,
            custom_fields=custom_fields,
        )

        issue_id = result['issue']['id']
        print(f'Ticket #{issue_id} created successfully')

        ticket_url = f'{client.base_url}/issues/{issue_id}'
        print(f'URL: {ticket_url}')

    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 404:
            print('Error: Project not found or invalid parameters', file=sys.stderr)
        elif e.response.status_code == 401:
            print('Error: Authentication failed. Check your API key', file=sys.stderr)
        elif e.response.status_code == 422:
            error_msg = 'Invalid ticket data'
            try:
                error_detail = e.response.json()
                if 'errors' in error_detail:
                    error_msg = f"Invalid ticket data: {', '.join(error_detail['errors'])}"
            except:
                pass
            print(f'Error: {error_msg}', file=sys.stderr)
        else:
            print(f'Error: HTTP {e.response.status_code}', file=sys.stderr)
            try:
                print(f'Details: {e.response.text}', file=sys.stderr)
            except:
                pass
        sys.exit(1)
    except requests.exceptions.RequestException as e:
        print(f'Error: Failed to connect to Redmine - {e}', file=sys.stderr)
        sys.exit(1)


def get_api_key(args_api_key: Optional[str]) -> str:
    if args_api_key:
        return args_api_key
    env_api_key = os.getenv('REDMINE_API_KEY')
    if env_api_key:
        return env_api_key
    print('Error: No API key. Use --api-key or set REDMINE_API_KEY', file=sys.stderr)
    sys.exit(1)


def get_redmine_url() -> str:
    redmine_url = os.getenv('REDMINE_URL')
    if not redmine_url:
        print('Error: REDMINE_URL environment variable is required', file=sys.stderr)
        sys.exit(1)
    return redmine_url


def main():
    parser = argparse.ArgumentParser(
        description='Redmine CLI - Pure API wrapper for ticket management'
    )
    subparsers = parser.add_subparsers(dest='command', help='Commands')

    # view
    view_p = subparsers.add_parser('view', help='View ticket details')
    view_p.add_argument('ticket_number', type=int, help='Ticket number')
    view_p.add_argument('--history', action='store_true', help='Show field change history')
    view_p.add_argument('--api-key', help='Redmine API key')

    # summary
    summary_p = subparsers.add_parser('summary', help='List assigned tickets')
    summary_p.add_argument('--status', help='Filter by status (comma-separated)')
    summary_p.add_argument('--priority', help='Filter by priority (comma-separated)')
    summary_p.add_argument('--api-key', help='Redmine API key')

    # note
    note_p = subparsers.add_parser('note', help='Add a note to a ticket')
    note_p.add_argument('ticket_number', type=int, help='Ticket number')
    note_p.add_argument('note', help='Note text')
    note_p.add_argument('--api-key', help='Redmine API key')

    # set-status
    status_p = subparsers.add_parser('set-status', help='Set ticket status')
    status_p.add_argument('ticket_number', type=int, help='Ticket number')
    status_p.add_argument('status', help='Status: new, in progress, resolved, feedback, closed, rejected, monitoring')
    status_p.add_argument('--api-key', help='Redmine API key')

    # set-field
    field_p = subparsers.add_parser('set-field', help='Set a custom field value')
    field_p.add_argument('ticket_number', type=int, help='Ticket number')
    field_p.add_argument('field_name', help='Custom field name (e.g., "Pull request(s)")')
    field_p.add_argument('value', help='Field value')
    field_p.add_argument('--api-key', help='Redmine API key')

    # set-description
    desc_p = subparsers.add_parser('set-description', help='Set ticket description')
    desc_p.add_argument('ticket_number', type=int, help='Ticket number')
    desc_p.add_argument('description', help='New description (Markdown format)')
    desc_p.add_argument('--api-key', help='Redmine API key')

    # report
    report_p = subparsers.add_parser('report', help='Generate HTML report of active tickets')
    report_p.add_argument('--api-key', help='Redmine API key')

    # attachment
    att_p = subparsers.add_parser('attachment', help='Download attachment(s) from a ticket')
    att_p.add_argument('ticket_number', type=int, help='Ticket number')
    att_p.add_argument('--filename', help='Download a specific attachment by filename')
    att_p.add_argument('--id', type=int, dest='attachment_id', help='Download a specific attachment by ID')
    att_p.add_argument('--output-dir', default='.', help='Directory to save downloaded files (default: current directory)')
    att_p.add_argument('--api-key', help='Redmine API key')

    # create-ticket
    create_p = subparsers.add_parser('create-ticket', help='Create a new ticket')
    create_p.add_argument('--subject', required=True, help='Ticket subject/title')
    create_p.add_argument('--project', required=True, help='Project ID or identifier')
    create_p.add_argument('--description', default='', help='Ticket description (Markdown format)')
    create_p.add_argument('--assigned-to', help='User ID or login to assign the ticket to')
    create_p.add_argument('--priority', help='Priority: low, normal, high, urgent, immediate')
    create_p.add_argument('--parent', type=int, help='Parent ticket number')
    create_p.add_argument('--category', help='Category ID or name')
    create_p.add_argument('--custom-field', nargs=2, action='append', metavar=('FIELD_NAME', 'VALUE'), help='Custom field (can be repeated)')
    create_p.add_argument('--api-key', help='Redmine API key')

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    api_key = get_api_key(getattr(args, 'api_key', None))
    client = RedmineClient(get_redmine_url(), api_key)

    commands = {
        'view': cmd_view,
        'summary': cmd_summary,
        'note': cmd_note,
        'set-status': cmd_set_status,
        'set-field': cmd_set_field,
        'set-description': cmd_set_description,
        'report': cmd_report,
        'attachment': cmd_attachment,
        'create-ticket': cmd_create_ticket,
    }

    commands[args.command](client, args)


if __name__ == '__main__':
    main()
