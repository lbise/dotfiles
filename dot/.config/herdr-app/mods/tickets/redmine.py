"""Redmine for the Tickets mod: prints Redmine's own JSON, providers.js reads it.

A trimmed copy of the redmine and vault-secrets skills (ai-skills repo): the mod
sends this file to the machine with `python3 -c`, so it must stand alone and use
the standard library only.

  list                open issues assigned to the current user, and every status name in
                      Redmine's order
  view <id>           one issue with its journals, relations, children, attachments, watchers
                      and allowed statuses; the standard fields its tracker uses, the related
                      issues' subjects and statuses, and the current user's id
  call <method> <path> [json]
                      one change: POST, PUT or DELETE on an API path, e.g.
                      PUT issues/7.json '{"issue": {"notes": "Done"}}'
  attach <id> <paths json> [description]
                      upload files from this machine and attach them
  download <attachment id> <dir>
                      save an attachment into <dir> (not over an existing file); prints its path
  options <project> <attr>
                      what an attribute can be set to: [{"id", "name"}], for tracker_id,
                      priority_id, assigned_to_id, category_id, fixed_version_id, project_id

Credential: REDMINE_API_KEY from the environment, else from the developer's Vault
agent folder (user_secrets/<user>/agent/credentials), as the skills do.
"""

import getpass
import json
import mimetypes
import os
import re
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REDMINE_URL = os.getenv('REDMINE_URL', 'https://ch03rdteam.phonak.com/redmine').rstrip('/')
VAULT_ADDR = os.getenv('VAULT_ADDR', 'https://ch03rdteam.phonak.com').rstrip('/')
MAIN_TOKEN_PATH = Path.home() / '.vault-token'
AGENT_TOKEN_PATH = Path.home() / '.vault-token-agent'
USER = getpass.getuser()
LOGIN_HINT = 'connect to this machine once from VS Code (vault_ssh), or run `c login` there'


class Failure(Exception):
    """A message that never contains a credential or token."""

    def __init__(self, message, status=0, errors=''):
        super().__init__(message)
        self.status = status
        # The server's own error messages; only shown for Redmine's validation errors.
        self.errors = errors


def get_json(url, headers, payload=None, method=None):
    data = None
    if isinstance(payload, bytes):
        data = payload
        headers = {**headers, 'Content-Type': 'application/octet-stream'}
    elif payload is not None:
        data = json.dumps(payload).encode()
        headers = {**headers, 'Content-Type': 'application/json'}
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read()
        # An update answers 204 with no body.
        return json.loads(body) if body.strip() else {}
    except urllib.error.HTTPError as error:
        with error:
            try:
                errors = '; '.join(str(e) for e in json.load(error)['errors'])
            except (OSError, ValueError, KeyError, TypeError):
                errors = ''
        raise Failure(f'HTTP {error.code}', error.code, errors) from None
    except OSError:
        raise Failure(f'cannot reach {urllib.parse.urlsplit(url).netloc}') from None
    except ValueError:
        raise Failure('unexpected response') from None


def read_token(path):
    try:
        return path.read_text().strip()
    except OSError:
        return ''


def new_agent_token():
    """An agent token made from ~/.vault-token and saved; '' when that is not possible."""
    main = read_token(MAIN_TOKEN_PATH)
    if not main:
        return ''
    try:
        token = get_json(f'{VAULT_ADDR}/v1/auth/token/create/agent', {'X-Vault-Token': main}, {})['auth']['client_token']
    except (Failure, KeyError, TypeError):
        return ''
    # A symlink is followed: in WSL, ~/.vault-token-agent points to the Windows one.
    path = AGENT_TOKEN_PATH.resolve()
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f'{path.name}.')
    try:
        with os.fdopen(fd, 'w') as file:
            file.write(token)
        os.replace(tmp, path)
    except BaseException:
        os.unlink(tmp)
        raise
    return token


def api_key():
    key = os.getenv('REDMINE_API_KEY')
    if key:
        return key
    token = read_token(AGENT_TOKEN_PATH) or new_agent_token()
    if not token:
        raise Failure(f'no Vault agent token: {LOGIN_HINT}')
    url = f'{VAULT_ADDR}/v1/user_secrets/data/{USER}/agent/credentials'
    try:
        try:
            body = get_json(url, {'X-Vault-Token': token})
        except Failure as error:
            fresh = new_agent_token() if error.status == 403 else ''
            if not fresh:
                raise
            body = get_json(url, {'X-Vault-Token': fresh})
    except Failure as error:
        if error.status == 403:
            raise Failure(f'Vault agent token expired or not allowed: {LOGIN_HINT}') from None
        if error.status == 404:
            raise Failure(f'nothing stored at user_secrets/{USER}/agent/credentials') from None
        raise Failure(f'Vault: {error.args[0]}') from None
    try:
        key = body['data']['data'].get('REDMINE_API_KEY')
    except (KeyError, TypeError, AttributeError):
        raise Failure('unexpected response from Vault') from None
    if not isinstance(key, str) or not key.strip():
        raise Failure(f'no field REDMINE_API_KEY in user_secrets/{USER}/agent/credentials')
    return key.strip()


def redmine(path, payload=None, method=None, **params):
    url = f'{REDMINE_URL}/{path}?{urllib.parse.urlencode(params)}'
    try:
        return get_json(url, {'X-Redmine-API-Key': api_key()}, payload, method)
    except Failure as error:
        if error.status == 401:
            raise Failure('Redmine refused the API key') from None
        if error.status == 422 and error.errors:
            raise Failure(f'Redmine: {error.errors}') from None
        raise Failure(f'Redmine: {error.args[0]}') from None


def view(issue_id):
    issue = redmine(f'issues/{issue_id}.json', include='journals,relations,children,attachments,watchers,allowed_statuses')['issue']
    trackers = redmine('trackers.json')['trackers']
    fields = next((t.get('enabled_standard_fields') for t in trackers if t['id'] == issue['tracker']['id']), None)
    others = {r['issue_to_id'] if r['issue_id'] == issue['id'] else r['issue_id'] for r in issue.get('relations', [])}
    related = {}
    if others:
        found = redmine('issues.json', issue_id=','.join(map(str, sorted(others))), status_id='*', limit=100)['issues']
        related = {i['id']: {'subject': i['subject'], 'status': i['status']['name']} for i in found}
    # Only the id: users/current.json also holds the API key.
    me = redmine('users/current.json')['user']['id']
    return {'base': REDMINE_URL, 'issue': issue, 'fields': fields, 'related': related, 'me': me}


def attach(issue_id, paths, description):
    uploads = []
    for path in paths:
        path = os.path.expanduser(path)
        if not os.path.isfile(path):
            raise Failure(f'no file {path}')
        with open(path, 'rb') as file:
            token = redmine('uploads.json', file.read(), 'POST', filename=os.path.basename(path))['upload']['token']
        uploads.append({'token': token, 'filename': os.path.basename(path), 'description': description,
                        'content_type': mimetypes.guess_type(path)[0] or 'application/octet-stream'})
    redmine(f'issues/{issue_id}.json', {'issue': {'uploads': uploads}}, 'PUT')


def download(attachment_id, folder):
    found = redmine(f'attachments/{attachment_id}.json')['attachment']
    # Built from REDMINE_URL (content_url can be plain http), so the API key goes to Redmine only.
    url = f"{REDMINE_URL}/attachments/download/{found['id']}/{urllib.parse.quote(found['filename'])}"
    folder = os.path.expanduser(folder)
    os.makedirs(folder, exist_ok=True)
    stem, ext = os.path.splitext(os.path.basename(found['filename']) or 'attachment')
    path, n = os.path.join(folder, stem + ext), 1
    while os.path.exists(path):
        path, n = os.path.join(folder, f'{stem} ({n}){ext}'), n + 1
    request = urllib.request.Request(url, headers={'X-Redmine-API-Key': api_key()})
    try:
        with urllib.request.urlopen(request, timeout=120) as response, open(path, 'xb') as file:
            while chunk := response.read(1 << 16):
                file.write(chunk)
    except OSError as error:
        if os.path.exists(path):
            os.unlink(path)
        raise Failure(f'download failed: {getattr(error, "code", "") or type(error).__name__}') from None
    return path


def paged(path, key, **params):
    """Every page of a list."""
    items, offset = [], 0
    while True:
        page = redmine(path, limit=100, offset=offset, **params)
        items += page[key]
        offset += 100
        if offset >= page.get('total_count', 0):
            return items


def options(project, attr):
    if attr == 'tracker_id':
        found = redmine(f'projects/{project}.json', include='trackers')['project']['trackers']
    elif attr == 'category_id':
        found = redmine(f'projects/{project}.json', include='issue_categories')['project']['issue_categories']
    elif attr == 'priority_id':
        found = [p for p in redmine('enumerations/issue_priorities.json')['issue_priorities'] if p.get('active', True)]
    elif attr == 'fixed_version_id':
        # Only open versions take issues; another project's (shared) ones are named with it, as Redmine does.
        found = [{'id': v['id'], 'name': v['name'] if v['project']['id'] == int(project) else f"{v['project']['name']} - {v['name']}"}
                 for v in redmine(f'projects/{project}/versions.json')['versions'] if v['status'] == 'open']
    elif attr == 'assigned_to_id':
        people = {}
        for m in paged(f'projects/{project}/memberships.json', 'memberships'):
            who = m.get('user') or m.get('group')
            if who:
                people[who['id']] = {'id': who['id'], 'name': who['name'] + ('' if 'user' in m else ' (group)')}
        found = sorted(people.values(), key=lambda p: p['name'].lower())
    elif attr == 'project_id':
        found = paged('projects.json', 'projects')
    else:
        raise Failure(f'options: unknown attribute {attr}')
    return [{'id': o['id'], 'name': o['name']} for o in found]


def main(args):
    if args == ['list']:
        found = redmine('issues.json', assigned_to_id='me', status_id='open', sort='priority:desc,updated_on:desc', limit=100)
        statuses = [st['name'] for st in redmine('issue_statuses.json')['issue_statuses']]
        print(json.dumps({'base': REDMINE_URL, 'issues': found['issues'], 'statuses': statuses}))
    elif len(args) == 2 and args[0] == 'view' and args[1].isdigit():
        print(json.dumps(view(args[1])))
    elif len(args) in (3, 4) and args[0] == 'call':
        method, path = args[1], args[2]
        if method not in ('POST', 'PUT', 'DELETE') or not re.fullmatch(r'[a-z_]+(/[a-z_0-9]+)*\.json', path):
            raise Failure(f'call: not an API change: {method} {path}')
        try:
            payload = json.loads(args[3]) if len(args) == 4 else None
        except ValueError:
            raise Failure('call: the change is not JSON') from None
        redmine(path, payload, method)
    elif len(args) in (3, 4) and args[0] == 'attach' and args[1].isdigit():
        paths = json.loads(args[2])
        if not isinstance(paths, list) or not paths or not all(isinstance(p, str) for p in paths):
            raise Failure('attach: expected a JSON list of paths')
        attach(args[1], paths, args[3] if len(args) == 4 else '')
    elif len(args) == 3 and args[0] == 'download' and args[1].isdigit():
        print(download(args[1], args[2]))
    elif len(args) == 3 and args[0] == 'options' and args[1].isdigit():
        print(json.dumps(options(args[1], args[2])))
    else:
        raise Failure('usage: list | view <id> | call <method> <path> [json] | attach <id> <paths> [description] | download <id> <dir> | options <project> <attr>')


if __name__ == '__main__':
    try:
        main(sys.argv[1:])
    except Failure as error:
        sys.exit(f'Error: {error}')
