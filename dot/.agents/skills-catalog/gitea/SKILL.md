---
name: gitea
description: Access, edit, comment, and create pull requests on gitea
---

# Gitea Skill

Pure Gitea API wrapper. No side effects outside Gitea - no git, no filesystem changes.

## Usage

Gitea can be accessed by using the [gitea script](./gitea.py).

Invoke the script like this:
```bash
python3 ./gitea.py <command> [options]
```

When run from within a git repository, the script auto-detects owner and repo from the git remote, so `--owner` and `--repo` are usually not needed.

**Multirepo workspace:** This workspace contains multiple git repos (`rom/`, `bt/`, `apps/`, etc.). Either:
- `cd` into the repo directory and rely on auto-detection, **or**
- Use `--owner` and `--repo` explicitly from anywhere

## Environment Variables

* `GITEA_URL` : Base URL of the Gitea instance (required)
* `GITEA_TOKEN` : API token for authentication (required)

## Commands

All commands accept `--owner OWNER --repo REPO` to override auto-detection.

### repos - List repositories

```
gitea.py repos                        # Repos for current user
gitea.py repos --owner USER           # Repos for a specific user
gitea.py repos --owner ORG --org      # Repos for an organization
```

### prs - List pull requests

```
gitea.py prs                          # Open PRs (current repo)
gitea.py prs --state closed|all       # Filter by state
```

### create-pr - Create a pull request

```
gitea.py create-pr "Title" --base to4/master                  # Current branch -> specified base
gitea.py create-pr "Title" --head BRANCH --base TARGET        # Specify both branches
gitea.py create-pr "Title" --base to4/master --body "..."     # With description
```

- `--base` is required. There is no default -- always specify the target branch explicitly.

### update-pr - Update a pull request

```
gitea.py update-pr N --title "New title"
gitea.py update-pr N --body "New description"
gitea.py update-pr N --base new-target
gitea.py update-pr N --state closed
```

### close-pr - Close a pull request

```
gitea.py close-pr N                   # Close a pull request
```

### pr-show - Show pull request details

```
gitea.py pr-show N                    # Title, body, state, branches
```

### pr-diff - Show pull request diff

```
gitea.py pr-diff N                    # Full diff
```

### pr-files - Show files changed in a pull request

```
gitea.py pr-files N                   # List of changed files
```

### pr-checks - Show CI check results

```
gitea.py pr-checks N                  # Pass/fail/pending status for each check
```

### pr-comment - Add a comment to a pull request

```
gitea.py pr-comment N "Comment text"                                   # General comment
gitea.py pr-comment N "Review note" --path src/foo.c --line 42         # Line-specific
```

- `--line` requires `--path`

### pr-comments - List review comments

```
gitea.py pr-comments N                # All comments on the PR
```

## Examples

```bash
# Create a PR with multiline description using heredoc
python3 ./gitea.py create-pr "Fix bug 123" --base to4/master --body "$(cat <<'EOF'
## What does this PR do?
* Fixes https://ch03rdteam.phonak.com/redmine/issues/123
EOF
)"

# Check CI status
python3 ./gitea.py pr-checks 5205

# Close a superseded PR
python3 ./gitea.py close-pr 5204

# Trigger a buildbot builder via comment
python3 ./gitea.py pr-comment 5205 "bb to4 dmtx_reg_ub3"

# Add a line-specific review comment
python3 ./gitea.py pr-comment 42 "Consider renaming" --path src/main.c --line 15

# Cross-repo: specify owner and repo explicitly
python3 ./gitea.py prs --owner andromeda --repo bt
```

## Known Limitations

* No support for assigning reviewers or labels via CLI. Use the Gitea web UI.
* No merge subcommand.
