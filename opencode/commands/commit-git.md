---
description: Commit changes using git
agent: build
---

Your task is to help the user to generate a commit message and commit the changes using git.

## Guidelines

- DO NOT add any ads such as "Generated with [Claude Code](https://claude.ai/code)"
- Checks which files are staged with git status
- If 0 files are staged, automatically adds all modified and new files with git add
- Performs a git diff to understand what changes are being committed
- Analyzes the diff to determine if multiple distinct logical changes are present
- If multiple distinct changes are detected, suggests breaking the commit into multiple smaller commits
- For each commit (or the single commit if not split), creates a commit message using the following rules
- The redmine ticket number does not need to be added to the title or the body as this is done by a hoook

## Format

* The commit message MUST start by a tag using the following format: "[<category>] Commit message"
* The category should be determined roughly by what was changed, (i.e. changes to prj/rcu/lib/dmtxng should be labeled dmtx)

## Example Titles

```
[DmTx] Fix broken unity tests due to missing mock
[COEX] Suspend BR/EDR interlaced scan during SBP, DM, A2DP streaming
[DmTx] Use SchedSyncService instead of BleSyncService
[DSP/ISS] Increased DCCM ROM memory needed by some test apps
```

## Rules

* title starts with a capital and is lowercase, no period at the end.
* Title should be a clear summary, max 72 characters.
* Use the body to detail the changes to the different files. Explain why the changes were done, not just what changes were done.
* Bullet points should be concise and high-level.

Avoid

* Vague titles like: "update", "fix stuff"
* Overly long or unfocused titles
* Excessive detail in bullet points

## Best Practices for Commits

- Atomic commits: Each commit should contain related changes that serve a single purpose
- Split large changes: If changes touch multiple concerns, split them into separate commits
- Present tense, imperative mood: Write commit messages as commands (e.g., "add feature" not "added feature")

## Guidelines for Splitting Commits

When analyzing the diff, consider splitting commits based on these criteria:

- Different concerns: Changes to unrelated parts of the codebase
- Different types of changes: Mixing features, fixes, refactoring, etc.
- File patterns: Changes to different types of files (e.g., source code vs documentation)
- Logical grouping: Changes that would be easier to understand or review separately
- Size: Very large changes that would be clearer if broken down
