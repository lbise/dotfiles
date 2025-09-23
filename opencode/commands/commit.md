---
description: Commit changes using git
agent: build
---

# Commit

Your task is to help the user commit the current changes.

## Instructions

- Use imperative mood in commit messages and description
- Group related changes together
- Keep commits focused and atomic when possible
- Title should be a clear summary, max 72 characters
- Use the body to detail the changes to the different files. Explain why the changes were done, not just what changes were done
- Bullet points should be concise and high-level

Some examples of commit messages:

```
[DmTx] Fix broken unity tests due to missing mock
[COEX] Suspend BR/EDR interlaced scan during SBP, DM, A2DP streaming
[DmTx] Use SchedSyncService instead of BleSyncService
[DSP/ISS] Increased DCCM ROM memory needed by some test apps
```

## Workflow

1. Start by reviewing the conversation history to understand what was accomplished.
2. Review the list of changed files by running `git status -s`
3. Use `git diff <file>` to see exactly what was changed and get more context. Only do this if needed
4. Consider if the changes should be in a single or multiple logicla commits
5. Identify which files belong together
6. Draft clear, descriptive commit messages using the format: `[<category>] <description>`
7. Present plan to the user. List the files you plan to add to each commit as well as the commit messages and descriptions.
8. Ask the user to confirm before continuing with the commits
9. Create commits, use `git add <files>` with your planned commit messages and descriptions

## Report

Show the result with `git log -n [N]`
