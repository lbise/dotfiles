#!/usr/bin/env python3

from __future__ import annotations

import argparse
import os
import re
import sys
from typing import Optional
from urllib.parse import parse_qs, unquote, urlparse

import requests


class ConfluenceClient:
    def __init__(self, base_url: str, token: str):
        self.base_url = base_url.rstrip('/')
        self.token = token
        self.session = requests.Session()
        self.session.headers.update(
            {
                'Authorization': f'Bearer {token}',
                'Content-Type': 'application/json',
            }
        )

    def get_page_by_id(self, page_id: str, expand: Optional[str] = None) -> dict:
        """Fetch a page by its ID."""
        url = f'{self.base_url}/rest/api/content/{page_id}'
        params = {}
        if expand:
            params['expand'] = expand
        else:
            params['expand'] = 'body.storage,version,space'

        response = self.session.get(url, params=params)
        response.raise_for_status()
        return response.json()

    def get_page_by_title(
        self, space_key: str, title: str, expand: Optional[str] = None
    ) -> Optional[dict]:
        """Fetch a page by its title within a space."""
        url = f'{self.base_url}/rest/api/content'
        params = {
            'spaceKey': space_key,
            'title': title,
            'expand': expand or 'body.storage,version,space',
        }

        response = self.session.get(url, params=params)
        response.raise_for_status()

        data = response.json()
        results = data.get('results', [])
        if results:
            return results[0]
        return None

    def list_spaces(self, limit: int = 25) -> dict:
        """List available spaces."""
        url = f'{self.base_url}/rest/api/space'
        params = {'limit': limit}

        response = self.session.get(url, params=params)
        response.raise_for_status()
        return response.json()

    def search(self, cql: str, limit: int = 25) -> dict:
        """Search using CQL (Confluence Query Language)."""
        url = f'{self.base_url}/rest/api/content/search'
        params = {'cql': cql, 'limit': limit}

        response = self.session.get(url, params=params)
        response.raise_for_status()
        return response.json()


def parse_confluence_url(url: str) -> dict:
    """Parse a Confluence URL to extract page identifiers."""
    parsed = urlparse(url)
    query_params = parse_qs(parsed.query)

    result = {'base_url': f'{parsed.scheme}://{parsed.netloc}'}

    # Check for pageId parameter
    if 'pageId' in query_params:
        result['page_id'] = query_params['pageId'][0]
        return result

    # Check for spaceKey and title parameters
    if 'spaceKey' in query_params and 'title' in query_params:
        result['space_key'] = query_params['spaceKey'][0]
        result['title'] = unquote(query_params['title'][0].replace('+', ' '))
        return result

    # Try to parse /display/SPACE/Title format
    path_match = re.match(r'/display/([^/]+)/(.+)', parsed.path)
    if path_match:
        result['space_key'] = path_match.group(1)
        result['title'] = unquote(path_match.group(2).replace('+', ' '))
        return result

    return result


def strip_html_tags(html: str) -> str:
    """Simple HTML tag stripper for basic display."""

    # Remove script and style elements
    clean = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', html, flags=re.DOTALL)
    # Replace common block elements with newlines
    clean = re.sub(r'</(p|div|h[1-6]|li|tr)>', '\n', clean, flags=re.IGNORECASE)
    clean = re.sub(r'<br\s*/?>', '\n', clean, flags=re.IGNORECASE)
    # Remove remaining tags
    clean = re.sub(r'<[^>]+>', '', clean)
    # Decode common HTML entities
    clean = clean.replace('&nbsp;', ' ')
    clean = clean.replace('&amp;', '&')
    clean = clean.replace('&lt;', '<')
    clean = clean.replace('&gt;', '>')
    clean = clean.replace('&quot;', '"')
    # Collapse multiple newlines
    clean = re.sub(r'\n{3,}', '\n\n', clean)
    return clean.strip()


def view_page(client: ConfluenceClient, page_id: str, raw: bool = False) -> None:
    """View a page by ID."""
    try:
        page = client.get_page_by_id(page_id)
        _display_page(client, page, page_id, raw)

    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 404:
            print(f'Error: Page with ID {page_id} not found', file=sys.stderr)
        elif e.response.status_code == 401:
            print('Error: Authentication failed. Check your token', file=sys.stderr)
        elif e.response.status_code == 403:
            print('Error: Access forbidden. Check your permissions', file=sys.stderr)
        else:
            print(
                f'Error: HTTP {e.response.status_code} - {e.response.text}',
                file=sys.stderr,
            )
        sys.exit(1)
    except requests.exceptions.RequestException as e:
        print(f'Error: Failed to connect to Confluence - {e}', file=sys.stderr)
        sys.exit(1)


def view_page_by_title(
    client: ConfluenceClient, space_key: str, title: str, raw: bool = False
) -> None:
    """View a page by space key and title."""
    try:
        page = client.get_page_by_title(space_key, title)
        if not page:
            print(
                f'Error: Page "{title}" not found in space {space_key}', file=sys.stderr
            )
            sys.exit(1)

        page_id = page.get('id', 'Unknown')
        _display_page(client, page, page_id, raw)

    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 401:
            print('Error: Authentication failed. Check your token', file=sys.stderr)
        elif e.response.status_code == 403:
            print('Error: Access forbidden. Check your permissions', file=sys.stderr)
        else:
            print(
                f'Error: HTTP {e.response.status_code} - {e.response.text}',
                file=sys.stderr,
            )
        sys.exit(1)
    except requests.exceptions.RequestException as e:
        print(f'Error: Failed to connect to Confluence - {e}', file=sys.stderr)
        sys.exit(1)


def get_page(client: ConfluenceClient, url_or_id: str, raw: bool = False) -> None:
    """Get a page by URL or ID."""
    # Check if it looks like a URL
    if url_or_id.startswith('http://') or url_or_id.startswith('https://'):
        parsed = parse_confluence_url(url_or_id)

        if 'page_id' in parsed:
            view_page(client, parsed['page_id'], raw)
        elif 'space_key' in parsed and 'title' in parsed:
            view_page_by_title(client, parsed['space_key'], parsed['title'], raw)
        else:
            print(f'Error: Could not parse URL: {url_or_id}', file=sys.stderr)
            print(
                'Supported formats:\n'
                '  - /pages/viewpage.action?pageId=123456\n'
                '  - /pages/viewpage.action?spaceKey=SPACE&title=Page+Title\n'
                '  - /display/SPACE/Page+Title',
                file=sys.stderr,
            )
            sys.exit(1)
    else:
        # Assume it's a page ID
        view_page(client, url_or_id, raw)


def _display_page(
    client: ConfluenceClient, page: dict, page_id: str, raw: bool = False
) -> None:
    """Display page content."""
    title = page.get('title', 'Untitled')
    space = page.get('space', {}).get('name', 'Unknown')
    version = page.get('version', {}).get('number', 'Unknown')
    body_html = page.get('body', {}).get('storage', {}).get('value', '')

    print(f'Title: {title}')
    print(f'Space: {space}')
    print(f'Version: {version}')
    print(f'URL: {client.base_url}/pages/viewpage.action?pageId={page_id}')
    print()

    if raw:
        print('--- Raw HTML Content ---')
        print(body_html)
    else:
        print('--- Content ---')
        print(strip_html_tags(body_html))


def search_pages(client: ConfluenceClient, query: str, limit: int = 25) -> None:
    """Search for pages using CQL."""
    try:
        # Build CQL query - search in title and text
        cql = f'type=page AND (title~"{query}" OR text~"{query}")'
        results = client.search(cql, limit=limit)

        pages = results.get('results', [])
        if not pages:
            print(f'No pages found matching: {query}')
            return

        print(f'Found {len(pages)} page(s):')
        print(f'{"ID":<12} {"Space":<15} {"Title"}')
        print('-' * 70)

        for page in pages:
            page_id = page.get('id', 'Unknown')
            space = page.get('space', {}).get('key', 'Unknown')
            title = page.get('title', 'Untitled')

            # Truncate title if too long
            if len(title) > 40:
                title = title[:37] + '...'

            print(f'{page_id:<12} {space:<15} {title}')

    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 401:
            print('Error: Authentication failed. Check your token', file=sys.stderr)
        elif e.response.status_code == 403:
            print('Error: Access forbidden. Check your permissions', file=sys.stderr)
        else:
            print(
                f'Error: HTTP {e.response.status_code} - {e.response.text}',
                file=sys.stderr,
            )
        sys.exit(1)
    except requests.exceptions.RequestException as e:
        print(f'Error: Failed to connect to Confluence - {e}', file=sys.stderr)
        sys.exit(1)


def list_spaces(client: ConfluenceClient, limit: int = 25) -> None:
    """List available spaces."""
    try:
        results = client.list_spaces(limit=limit)

        spaces = results.get('results', [])
        if not spaces:
            print('No spaces found')
            return

        print(f'Found {len(spaces)} space(s):')
        print(f'{"Key":<15} {"Name"}')
        print('-' * 50)

        for space in spaces:
            key = space.get('key', 'Unknown')
            name = space.get('name', 'Untitled')

            print(f'{key:<15} {name}')

    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 401:
            print('Error: Authentication failed. Check your token', file=sys.stderr)
        elif e.response.status_code == 403:
            print('Error: Access forbidden. Check your permissions', file=sys.stderr)
        else:
            print(
                f'Error: HTTP {e.response.status_code} - {e.response.text}',
                file=sys.stderr,
            )
        sys.exit(1)
    except requests.exceptions.RequestException as e:
        print(f'Error: Failed to connect to Confluence - {e}', file=sys.stderr)
        sys.exit(1)


def get_token() -> str:
    token = os.getenv('CONFLUENCE_TOKEN')
    if token:
        return token

    print(
        'Error: No token provided. Set CONFLUENCE_TOKEN environment variable',
        file=sys.stderr,
    )
    sys.exit(1)


def get_confluence_url() -> str:
    confluence_url = os.getenv('CONFLUENCE_URL')
    if not confluence_url:
        print(
            'Error: CONFLUENCE_URL environment variable is required', file=sys.stderr
        )
        sys.exit(1)
    return confluence_url


def main():
    parser = argparse.ArgumentParser(description='Confluence CLI tool')
    subparsers = parser.add_subparsers(dest='command', help='Available commands')

    # Get page command (by URL or ID)
    get_parser = subparsers.add_parser('get', help='Get a page by URL or ID')
    get_parser.add_argument('url_or_id', help='Confluence URL or page ID')
    get_parser.add_argument(
        '--raw', action='store_true', help='Show raw HTML instead of stripped text'
    )

    # View page command (by ID only, kept for backward compatibility)
    view_parser = subparsers.add_parser('view', help='View a page by ID')
    view_parser.add_argument('page_id', help='Page ID to view')
    view_parser.add_argument(
        '--raw', action='store_true', help='Show raw HTML instead of stripped text'
    )

    # Search command
    search_parser = subparsers.add_parser('search', help='Search for pages')
    search_parser.add_argument('query', help='Search query')
    search_parser.add_argument(
        '--limit', type=int, default=25, help='Maximum results (default: 25)'
    )

    # List spaces command
    spaces_parser = subparsers.add_parser('spaces', help='List available spaces')
    spaces_parser.add_argument(
        '--limit', type=int, default=25, help='Maximum results (default: 25)'
    )

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    token = get_token()
    confluence_url = get_confluence_url()
    client = ConfluenceClient(confluence_url, token)

    if args.command == 'get':
        get_page(client, args.url_or_id, raw=args.raw)
    elif args.command == 'view':
        view_page(client, args.page_id, raw=args.raw)
    elif args.command == 'search':
        search_pages(client, args.query, limit=args.limit)
    elif args.command == 'spaces':
        list_spaces(client, limit=args.limit)


if __name__ == '__main__':
    main()
