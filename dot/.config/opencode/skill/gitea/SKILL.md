---
name: gitea
description: Access, edit and create pull requests on gitea
---

Gitea is a repository interface where pull requests can be created and reviewed.

## Gitea

Gitea can be accessed by using the gitea.py python script. It is accessible directly from the PATH.

The script works with a series of subcommands invoked like this: `gitea.py <subcommand>`

When run from within a git repository, the script automatically detects the owner and repo from the git remote, so `--owner` and `--repo` options are often not needed.

**Environment Variables Required:**
* `GITEA_URL` : The base URL of the Gitea instance
* `GITEA_TOKEN` : API token for authentication

## Important Subcommands

* `repos` : List repositories for the current user
* `repos --owner <user>` : List repositories for a specific user
* `repos --owner <org> --org` : List repositories for an organization
* `prs` : List pull requests for the current repository (open by default)
* `prs --state <state>` : List pull requests filtered by state (open, closed, all)
* `create-pr <title>` : Create a new pull request from current branch to main
* `create-pr <title> --head <branch> --base <target>` : Create PR with specific source and target branches
* `create-pr <title> --body <description>` : Create PR with a description
* `pr-show <number>` : Show details of a specific pull request
* `pr-diff <number>` : Show the diff for a pull request
* `pr-files <number>` : Show files changed in a pull request
* `pr-comment <number> <body>` : Add a general comment to a pull request
* `pr-comment <number> <body> --path <file> --line <num>` : Add a line-specific review comment
* `pr-comments <number>` : List all review comments on a pull request

## Examples

* List all repositories for the current user:
  `gitea.py repos`

* List repositories for organization "myorg":
  `gitea.py repos --owner myorg --org`

* List open pull requests for the current repo:
  `gitea.py prs`

* List all pull requests (including closed):
  `gitea.py prs --state all`

* Create a pull request from the current branch to main:
  `gitea.py create-pr "Add new feature"`

* Create a pull request with a description:
  `gitea.py create-pr "Fix bug #123" --body "This fixes the issue reported in ticket #123"`

* Create a pull request from feature branch to develop:
  `gitea.py create-pr "Merge feature" --head feature-branch --base develop`

* View pull request #42 details:
  `gitea.py pr-show 42`

* View the diff for pull request #42:
  `gitea.py pr-diff 42`

* View files changed in pull request #42:
  `gitea.py pr-files 42`

* Add a general comment to pull request #42:
  `gitea.py pr-comment 42 "This looks good to me!"`

* Add a line-specific review comment:
  `gitea.py pr-comment 42 "Consider renaming this variable" --path src/main.py --line 15`

* List all review comments on pull request #42:
  `gitea.py pr-comments 42`

* Specify owner and repo explicitly (for repos not matching current directory):
  `gitea.py prs --owner myteam --repo myproject`
