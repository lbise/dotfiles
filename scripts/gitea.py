#!/usr/bin/env python3

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from typing import Optional

import requests


class GiteaClient:
    def __init__(self, base_url: str, api_token: str):
        self.base_url = base_url.rstrip('/')
        self.api_url = f'{self.base_url}/api/v1'
        self.api_token = api_token
        self.session = requests.Session()
        self.session.headers.update(
            {'Authorization': f'token {api_token}', 'Content-Type': 'application/json'}
        )

    def _paginate(self, url: str, params: Optional[dict] = None) -> list:
        """Fetch all pages of a paginated API endpoint."""
        if params is None:
            params = {}

        all_results = []
        page = 1
        per_page = 50  # Gitea default max per page

        while True:
            params['page'] = page
            params['limit'] = per_page
            response = self.session.get(url, params=params)
            response.raise_for_status()
            results = response.json()

            if not results:
                break

            all_results.extend(results)

            # If we got fewer results than requested, we've reached the end
            if len(results) < per_page:
                break

            page += 1

        return all_results

    def get_current_user(self) -> dict:
        """Get the currently authenticated user."""
        url = f'{self.api_url}/user'
        response = self.session.get(url)
        response.raise_for_status()
        return response.json()

    def list_user_repos(self, username: Optional[str] = None) -> list:
        """List repositories for a user. If no username, lists repos for current user."""
        if username:
            url = f'{self.api_url}/users/{username}/repos'
        else:
            url = f'{self.api_url}/user/repos'

        return self._paginate(url)

    def list_org_repos(self, org: str) -> list:
        """List repositories for an organization."""
        url = f'{self.api_url}/orgs/{org}/repos'
        return self._paginate(url)

    def list_pull_requests(
        self,
        owner: str,
        repo: str,
        state: str = 'open',
    ) -> list:
        """List pull requests for a repository."""
        url = f'{self.api_url}/repos/{owner}/{repo}/pulls'
        params = {'state': state}
        return self._paginate(url, params)

    def get_pull_request(self, owner: str, repo: str, pr_number: int) -> dict:
        """Get a specific pull request."""
        url = f'{self.api_url}/repos/{owner}/{repo}/pulls/{pr_number}'
        response = self.session.get(url)
        response.raise_for_status()
        return response.json()

    def create_pull_request(
        self,
        owner: str,
        repo: str,
        title: str,
        head: str,
        base: str,
        body: Optional[str] = None,
    ) -> dict:
        """Create a new pull request."""
        url = f'{self.api_url}/repos/{owner}/{repo}/pulls'
        data = {
            'title': title,
            'head': head,
            'base': base,
        }
        if body:
            data['body'] = body

        response = self.session.post(url, json=data)
        response.raise_for_status()
        return response.json()

    def get_pull_request_diff(self, owner: str, repo: str, pr_number: int) -> str:
        """Get the diff for a pull request."""
        url = f'{self.api_url}/repos/{owner}/{repo}/pulls/{pr_number}.diff'
        response = self.session.get(url)
        response.raise_for_status()
        return response.text

    def get_pull_request_files(self, owner: str, repo: str, pr_number: int) -> list:
        """Get the list of files changed in a pull request."""
        url = f'{self.api_url}/repos/{owner}/{repo}/pulls/{pr_number}/files'
        return self._paginate(url)

    def get_pull_request_comments(self, owner: str, repo: str, pr_number: int) -> list:
        """Get review comments on a pull request."""
        url = f'{self.api_url}/repos/{owner}/{repo}/pulls/{pr_number}/comments'
        return self._paginate(url)

    def create_pull_request_comment(
        self,
        owner: str,
        repo: str,
        pr_number: int,
        body: str,
        commit_id: str,
        path: str,
        line: int,
        side: str = 'RIGHT',
    ) -> dict:
        """Create a review comment on a specific line of a pull request.

        Args:
            owner: Repository owner
            repo: Repository name
            pr_number: Pull request number
            body: Comment text
            commit_id: The SHA of the commit to comment on
            path: The relative path of the file to comment on
            line: The line number in the diff to comment on (new file line)
            side: Which side of the diff to comment on ('LEFT' for old, 'RIGHT' for new)
        """
        url = f'{self.api_url}/repos/{owner}/{repo}/pulls/{pr_number}/comments'
        data = {
            'body': body,
            'commit_id': commit_id,
            'path': path,
            'new_position': line,
        }

        response = self.session.post(url, json=data)
        response.raise_for_status()
        return response.json()

    def create_issue_comment(
        self,
        owner: str,
        repo: str,
        pr_number: int,
        body: str,
    ) -> dict:
        """Create a general comment on a pull request (not line-specific).

        This uses the issues API since PRs are also issues in Gitea.
        """
        url = f'{self.api_url}/repos/{owner}/{repo}/issues/{pr_number}/comments'
        data = {'body': body}

        response = self.session.post(url, json=data)
        response.raise_for_status()
        return response.json()


class GiteaManager:
    def __init__(self, gitea_url: str, api_token: str):
        self.client = GiteaClient(gitea_url, api_token)
        self.gitea_url = gitea_url

    def _get_current_git_branch(self) -> Optional[str]:
        """Get the current git branch name."""
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

    def _get_git_remote_info(self) -> Optional[tuple[str, str]]:
        """Get owner and repo name from git remote origin."""
        try:
            result = subprocess.run(
                ['git', 'remote', 'get-url', 'origin'],
                check=True,
                capture_output=True,
                text=True,
            )
            remote_url = result.stdout.strip()

            # Parse the remote URL to extract owner and repo
            # Handles both SSH and HTTPS URLs
            if remote_url.startswith('git@'):
                # SSH format: git@host:owner/repo.git
                path = remote_url.split(':')[1]
            elif remote_url.startswith('http'):
                # HTTPS format: https://host/owner/repo.git
                path = '/'.join(remote_url.split('/')[3:])
            else:
                return None

            # Remove .git suffix if present
            if path.endswith('.git'):
                path = path[:-4]

            parts = path.split('/')
            if len(parts) >= 2:
                return parts[0], parts[1]
            return None
        except (subprocess.CalledProcessError, FileNotFoundError):
            return None

    def list_repos(self, owner: Optional[str] = None, org: bool = False) -> None:
        """List repositories."""
        try:
            if org and owner:
                repos = self.client.list_org_repos(owner)
                print(f'Repositories for organization "{owner}":')
            elif owner:
                repos = self.client.list_user_repos(owner)
                print(f'Repositories for user "{owner}":')
            else:
                repos = self.client.list_user_repos()
                user = self.client.get_current_user()
                print(f'Repositories for {user["login"]}:')

            if not repos:
                print('No repositories found.')
                return

            print(f'\n{"Name":<40} {"Stars":<6} {"Forks":<6} {"Private"}')
            print('-' * 65)

            for repo in repos:
                name = repo['full_name']
                if len(name) > 38:
                    name = name[:35] + '...'
                stars = repo.get('stars_count', 0)
                forks = repo.get('forks_count', 0)
                private = 'Yes' if repo.get('private') else 'No'
                print(f'{name:<40} {stars:<6} {forks:<6} {private}')

            print('-' * 65)
            print(f'Total: {len(repos)} repositories')

        except requests.exceptions.HTTPError as e:
            self._handle_http_error(e)
        except requests.exceptions.RequestException as e:
            print(f'Error: Failed to connect to Gitea server - {e}', file=sys.stderr)
            sys.exit(1)

    def list_prs(
        self,
        owner: Optional[str] = None,
        repo: Optional[str] = None,
        state: str = 'open',
    ) -> None:
        """List pull requests for a repository."""
        try:
            # If owner/repo not provided, try to get from git remote
            if not owner or not repo:
                remote_info = self._get_git_remote_info()
                if remote_info:
                    owner, repo = remote_info
                else:
                    print(
                        'Error: Could not determine repository. Please specify --owner and --repo, or run from within a git repository.',
                        file=sys.stderr,
                    )
                    sys.exit(1)

            prs = self.client.list_pull_requests(owner, repo, state=state)

            print(f'Pull requests for {owner}/{repo} (state: {state}):')

            if not prs:
                print('No pull requests found.')
                return

            print(f'\n{"#":<6} {"Title":<50} {"Author":<15} {"State"}')
            print('-' * 85)

            for pr in prs:
                number = f'#{pr["number"]}'
                title = pr['title']
                if len(title) > 48:
                    title = title[:45] + '...'
                author = pr['user']['login']
                if len(author) > 13:
                    author = author[:10] + '...'
                state_display = pr['state']
                print(f'{number:<6} {title:<50} {author:<15} {state_display}')

            print('-' * 85)
            print(f'Total: {len(prs)} pull requests')

        except requests.exceptions.HTTPError as e:
            self._handle_http_error(e)
        except requests.exceptions.RequestException as e:
            print(f'Error: Failed to connect to Gitea server - {e}', file=sys.stderr)
            sys.exit(1)

    def create_pr(
        self,
        title: str,
        head: Optional[str] = None,
        base: str = 'main',
        body: Optional[str] = None,
        owner: Optional[str] = None,
        repo: Optional[str] = None,
    ) -> None:
        """Create a new pull request."""
        try:
            # If owner/repo not provided, try to get from git remote
            if not owner or not repo:
                remote_info = self._get_git_remote_info()
                if remote_info:
                    owner, repo = remote_info
                else:
                    print(
                        'Error: Could not determine repository. Please specify --owner and --repo, or run from within a git repository.',
                        file=sys.stderr,
                    )
                    sys.exit(1)

            # If head not provided, use current branch
            if not head:
                head = self._get_current_git_branch()
                if not head:
                    print(
                        'Error: Could not determine current branch. Please specify --head.',
                        file=sys.stderr,
                    )
                    sys.exit(1)

            print(f'Creating pull request...')
            print(f'  Repository: {owner}/{repo}')
            print(f'  Head: {head}')
            print(f'  Base: {base}')
            print(f'  Title: {title}')

            pr = self.client.create_pull_request(
                owner=owner,
                repo=repo,
                title=title,
                head=head,
                base=base,
                body=body,
            )

            print(f'\nPull request created successfully!')
            print(f'  PR #{pr["number"]}: {pr["title"]}')
            print(f'  URL: {pr["html_url"]}')

        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 422:
                error_detail = e.response.json() if e.response.content else {}
                message = error_detail.get('message', 'Validation failed')
                print(f'Error: {message}', file=sys.stderr)
                if 'pull request already exists' in message.lower():
                    print('A pull request from this branch already exists.', file=sys.stderr)
            elif e.response.status_code == 404:
                print(f'Error: Repository {owner}/{repo} not found', file=sys.stderr)
            elif e.response.status_code == 401:
                print('Error: Authentication failed. Check your GITEA_TOKEN', file=sys.stderr)
            else:
                print(f'Error: HTTP {e.response.status_code} - {e.response.text}', file=sys.stderr)
            sys.exit(1)
        except requests.exceptions.RequestException as e:
            print(f'Error: Failed to connect to Gitea server - {e}', file=sys.stderr)
            sys.exit(1)

    def _handle_http_error(self, e: requests.exceptions.HTTPError) -> None:
        """Handle HTTP errors consistently."""
        if e.response.status_code == 404:
            print('Error: Resource not found', file=sys.stderr)
        elif e.response.status_code == 401:
            print('Error: Authentication failed. Check your GITEA_TOKEN', file=sys.stderr)
        elif e.response.status_code == 403:
            print('Error: Access forbidden. Check your permissions.', file=sys.stderr)
        else:
            print(
                f'Error: HTTP {e.response.status_code} - {e.response.text}',
                file=sys.stderr,
            )
        sys.exit(1)

    def _resolve_owner_repo(
        self, owner: Optional[str], repo: Optional[str]
    ) -> tuple[str, str]:
        """Resolve owner/repo from args or git remote."""
        if owner and repo:
            return owner, repo

        remote_info = self._get_git_remote_info()
        if remote_info:
            return remote_info

        print(
            'Error: Could not determine repository. Please specify --owner and --repo, or run from within a git repository.',
            file=sys.stderr,
        )
        sys.exit(1)

    def show_pr(
        self,
        pr_number: int,
        owner: Optional[str] = None,
        repo: Optional[str] = None,
    ) -> None:
        """Show details of a specific pull request."""
        try:
            owner, repo = self._resolve_owner_repo(owner, repo)
            pr = self.client.get_pull_request(owner, repo, pr_number)

            print(f'Pull Request #{pr["number"]}: {pr["title"]}')
            print(f'  URL: {pr["html_url"]}')
            print(f'  State: {pr["state"]}')
            print(f'  Author: {pr["user"]["login"]}')
            print(f'  Branch: {pr["head"]["ref"]} -> {pr["base"]["ref"]}')
            print(f'  Created: {pr["created_at"]}')
            print(f'  Updated: {pr["updated_at"]}')
            print(f'  Mergeable: {pr.get("mergeable", "unknown")}')
            print(f'  Head SHA: {pr["head"]["sha"]}')

            if pr.get('body'):
                print(f'\nDescription:\n{pr["body"]}')

        except requests.exceptions.HTTPError as e:
            self._handle_http_error(e)
        except requests.exceptions.RequestException as e:
            print(f'Error: Failed to connect to Gitea server - {e}', file=sys.stderr)
            sys.exit(1)

    def show_pr_diff(
        self,
        pr_number: int,
        owner: Optional[str] = None,
        repo: Optional[str] = None,
    ) -> None:
        """Show the diff for a pull request."""
        try:
            owner, repo = self._resolve_owner_repo(owner, repo)
            diff = self.client.get_pull_request_diff(owner, repo, pr_number)
            print(diff)

        except requests.exceptions.HTTPError as e:
            self._handle_http_error(e)
        except requests.exceptions.RequestException as e:
            print(f'Error: Failed to connect to Gitea server - {e}', file=sys.stderr)
            sys.exit(1)

    def show_pr_files(
        self,
        pr_number: int,
        owner: Optional[str] = None,
        repo: Optional[str] = None,
    ) -> None:
        """Show the files changed in a pull request."""
        try:
            owner, repo = self._resolve_owner_repo(owner, repo)
            files = self.client.get_pull_request_files(owner, repo, pr_number)

            if not files:
                print('No files changed.')
                return

            print(f'Files changed in PR #{pr_number}:')
            print(f'\n{"Status":<12} {"Additions":<10} {"Deletions":<10} {"File"}')
            print('-' * 80)

            total_additions = 0
            total_deletions = 0

            for f in files:
                status = f.get('status', 'modified')
                additions = f.get('additions', 0)
                deletions = f.get('deletions', 0)
                filename = f.get('filename', f.get('path', 'unknown'))

                total_additions += additions
                total_deletions += deletions

                print(f'{status:<12} +{additions:<9} -{deletions:<9} {filename}')

            print('-' * 80)
            print(f'Total: {len(files)} files, +{total_additions} additions, -{total_deletions} deletions')

        except requests.exceptions.HTTPError as e:
            self._handle_http_error(e)
        except requests.exceptions.RequestException as e:
            print(f'Error: Failed to connect to Gitea server - {e}', file=sys.stderr)
            sys.exit(1)

    def add_pr_comment(
        self,
        pr_number: int,
        body: str,
        path: Optional[str] = None,
        line: Optional[int] = None,
        owner: Optional[str] = None,
        repo: Optional[str] = None,
    ) -> None:
        """Add a comment to a pull request.

        If path and line are provided, creates a line-specific review comment.
        Otherwise, creates a general comment on the PR.
        """
        try:
            owner, repo = self._resolve_owner_repo(owner, repo)

            if path and line:
                # Line-specific comment - need the head commit SHA
                pr = self.client.get_pull_request(owner, repo, pr_number)
                commit_id = pr['head']['sha']

                comment = self.client.create_pull_request_comment(
                    owner=owner,
                    repo=repo,
                    pr_number=pr_number,
                    body=body,
                    commit_id=commit_id,
                    path=path,
                    line=line,
                )
                print(f'Review comment added to {path}:{line}')
                print(f'  Comment ID: {comment["id"]}')
            else:
                # General PR comment
                comment = self.client.create_issue_comment(
                    owner=owner,
                    repo=repo,
                    pr_number=pr_number,
                    body=body,
                )
                print(f'Comment added to PR #{pr_number}')
                print(f'  Comment ID: {comment["id"]}')

        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 422:
                error_detail = e.response.json() if e.response.content else {}
                message = error_detail.get('message', 'Validation failed')
                print(f'Error: {message}', file=sys.stderr)
            else:
                self._handle_http_error(e)
        except requests.exceptions.RequestException as e:
            print(f'Error: Failed to connect to Gitea server - {e}', file=sys.stderr)
            sys.exit(1)

    def list_pr_comments(
        self,
        pr_number: int,
        owner: Optional[str] = None,
        repo: Optional[str] = None,
    ) -> None:
        """List review comments on a pull request."""
        try:
            owner, repo = self._resolve_owner_repo(owner, repo)
            comments = self.client.get_pull_request_comments(owner, repo, pr_number)

            if not comments:
                print(f'No review comments on PR #{pr_number}.')
                return

            print(f'Review comments on PR #{pr_number}:')
            print('-' * 80)

            for comment in comments:
                user = comment['user']['login']
                path = comment.get('path', 'N/A')
                line = comment.get('line', comment.get('new_position', 'N/A'))
                created = comment['created_at']
                body = comment['body']

                print(f'\n[{user}] {path}:{line} ({created})')
                print(f'{body}')

            print('-' * 80)
            print(f'Total: {len(comments)} comments')

        except requests.exceptions.HTTPError as e:
            self._handle_http_error(e)
        except requests.exceptions.RequestException as e:
            print(f'Error: Failed to connect to Gitea server - {e}', file=sys.stderr)
            sys.exit(1)


def get_api_token() -> str:
    """Get API token from environment variable."""
    token = os.getenv('GITEA_TOKEN')
    if not token:
        print(
            'Error: GITEA_TOKEN environment variable is required',
            file=sys.stderr,
        )
        sys.exit(1)
    return token


def get_gitea_url() -> str:
    """Get Gitea URL from environment variable."""
    gitea_url = os.getenv('GITEA_URL')
    if not gitea_url:
        print('Error: GITEA_URL environment variable is required', file=sys.stderr)
        sys.exit(1)
    return gitea_url


def main():
    parser = argparse.ArgumentParser(description='Gitea CLI tool')
    subparsers = parser.add_subparsers(dest='command', help='Available commands')

    # List repositories command
    repos_parser = subparsers.add_parser('repos', help='List repositories')
    repos_parser.add_argument(
        '--owner',
        help='Username or organization name (default: current user)',
    )
    repos_parser.add_argument(
        '--org',
        action='store_true',
        help='Treat owner as an organization',
    )

    # List pull requests command
    prs_parser = subparsers.add_parser('prs', help='List pull requests')
    prs_parser.add_argument(
        '--owner',
        help='Repository owner (default: from git remote)',
    )
    prs_parser.add_argument(
        '--repo',
        help='Repository name (default: from git remote)',
    )
    prs_parser.add_argument(
        '--state',
        choices=['open', 'closed', 'all'],
        default='open',
        help='Filter by state (default: open)',
    )

    # Create pull request command
    create_pr_parser = subparsers.add_parser('create-pr', help='Create a pull request')
    create_pr_parser.add_argument(
        'title',
        help='Pull request title',
    )
    create_pr_parser.add_argument(
        '--head',
        help='Source branch (default: current branch)',
    )
    create_pr_parser.add_argument(
        '--base',
        default='main',
        help='Target branch (default: main)',
    )
    create_pr_parser.add_argument(
        '--body',
        help='Pull request description',
    )
    create_pr_parser.add_argument(
        '--owner',
        help='Repository owner (default: from git remote)',
    )
    create_pr_parser.add_argument(
        '--repo',
        help='Repository name (default: from git remote)',
    )

    # Show pull request details
    pr_show_parser = subparsers.add_parser('pr-show', help='Show pull request details')
    pr_show_parser.add_argument(
        'pr_number',
        type=int,
        help='Pull request number',
    )
    pr_show_parser.add_argument(
        '--owner',
        help='Repository owner (default: from git remote)',
    )
    pr_show_parser.add_argument(
        '--repo',
        help='Repository name (default: from git remote)',
    )

    # Show pull request diff
    pr_diff_parser = subparsers.add_parser('pr-diff', help='Show pull request diff')
    pr_diff_parser.add_argument(
        'pr_number',
        type=int,
        help='Pull request number',
    )
    pr_diff_parser.add_argument(
        '--owner',
        help='Repository owner (default: from git remote)',
    )
    pr_diff_parser.add_argument(
        '--repo',
        help='Repository name (default: from git remote)',
    )

    # Show pull request files
    pr_files_parser = subparsers.add_parser('pr-files', help='Show files changed in a pull request')
    pr_files_parser.add_argument(
        'pr_number',
        type=int,
        help='Pull request number',
    )
    pr_files_parser.add_argument(
        '--owner',
        help='Repository owner (default: from git remote)',
    )
    pr_files_parser.add_argument(
        '--repo',
        help='Repository name (default: from git remote)',
    )

    # Add comment to pull request
    pr_comment_parser = subparsers.add_parser('pr-comment', help='Add a comment to a pull request')
    pr_comment_parser.add_argument(
        'pr_number',
        type=int,
        help='Pull request number',
    )
    pr_comment_parser.add_argument(
        'body',
        help='Comment text',
    )
    pr_comment_parser.add_argument(
        '--path',
        help='File path for line-specific comment',
    )
    pr_comment_parser.add_argument(
        '--line',
        type=int,
        help='Line number for line-specific comment (requires --path)',
    )
    pr_comment_parser.add_argument(
        '--owner',
        help='Repository owner (default: from git remote)',
    )
    pr_comment_parser.add_argument(
        '--repo',
        help='Repository name (default: from git remote)',
    )

    # List pull request comments
    pr_comments_parser = subparsers.add_parser('pr-comments', help='List review comments on a pull request')
    pr_comments_parser.add_argument(
        'pr_number',
        type=int,
        help='Pull request number',
    )
    pr_comments_parser.add_argument(
        '--owner',
        help='Repository owner (default: from git remote)',
    )
    pr_comments_parser.add_argument(
        '--repo',
        help='Repository name (default: from git remote)',
    )

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    token = get_api_token()
    gitea_url = get_gitea_url()
    manager = GiteaManager(gitea_url, token)

    if args.command == 'repos':
        manager.list_repos(owner=args.owner, org=args.org)
    elif args.command == 'prs':
        manager.list_prs(owner=args.owner, repo=args.repo, state=args.state)
    elif args.command == 'create-pr':
        manager.create_pr(
            title=args.title,
            head=args.head,
            base=args.base,
            body=args.body,
            owner=args.owner,
            repo=args.repo,
        )
    elif args.command == 'pr-show':
        manager.show_pr(
            pr_number=args.pr_number,
            owner=args.owner,
            repo=args.repo,
        )
    elif args.command == 'pr-diff':
        manager.show_pr_diff(
            pr_number=args.pr_number,
            owner=args.owner,
            repo=args.repo,
        )
    elif args.command == 'pr-files':
        manager.show_pr_files(
            pr_number=args.pr_number,
            owner=args.owner,
            repo=args.repo,
        )
    elif args.command == 'pr-comment':
        if args.line and not args.path:
            print('Error: --line requires --path', file=sys.stderr)
            sys.exit(1)
        manager.add_pr_comment(
            pr_number=args.pr_number,
            body=args.body,
            path=args.path,
            line=args.line,
            owner=args.owner,
            repo=args.repo,
        )
    elif args.command == 'pr-comments':
        manager.list_pr_comments(
            pr_number=args.pr_number,
            owner=args.owner,
            repo=args.repo,
        )


if __name__ == '__main__':
    main()
