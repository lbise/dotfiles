---
description: Code review of a pull request
---

Provide a code review for the given pull request.

Pull request reference: $ARGUMENTS

Before starting, ensure the user provided a pull request number or another unambiguous pull request identifier. If not, or if the scope of the requested review is unclear, **STOP** and ask the user to clarify.

## Phase 1 -- Setup

1. Use the **gitea** skill for all Gitea interactions. In this repo, if you need the exact skill instructions, read `.agents/skills/gitea/SKILL.md` before using any Gitea commands.

2. Fetch the pull request information with `pr-show`. Verify that the pull request has not already been reviewed by checking `pr-comments`. If it was already reviewed, **STOP** and inform the user.

3. Retrieve the list of changed files with `pr-files`. If the change set is large enough that it should be reviewed in chunks, **STOP**, explain the proposed chunking plan to the user, and wait for agreement before proceeding.

4. **Check out the PR branch locally.** This gives you full codebase context during the review.

   - Determine the PR's head branch and base branch from the `pr-show` output.
   - Check the current git branch with `git branch --show-current`.
   - If you are already on the PR branch, stay on it and update it if appropriate.
   - If you are on a different branch:
     - If there are uncommitted changes, stash tracked and untracked changes.
     - Fetch and check out the PR branch.
     - Remember the original branch name and whether a stash was created so you can restore the local state later.
   - If checkout, fetch, or stashing fails, **STOP** and explain the problem clearly.

5. Generate the scoped diff locally:
   ```
   git diff <base_branch>...<head_branch>
   ```
   This diff defines exactly which files and lines are part of the PR. All review findings and all inline comments **must** be scoped to changed lines in this diff.

## Phase 2 -- Independent code review passes

Perform 4 independent review passes over the same scoped diff. Keep the passes logically separate. If your environment provides safe parallel review tooling, you may use it. Otherwise, do the 4 passes sequentially.

Each pass should return a list of candidate issues. For each candidate issue, include:
- a brief description
- the reason it was flagged (for example: `code smell`, `bug`)
- the affected file and changed line(s)
- a confidence level

**Context rules for all passes:**
- You **CAN** read local files for surrounding context such as imports, type definitions, function signatures, and module structure.
- You **MUST** only flag issues on lines that are part of the PR diff generated in Phase 1.
- Do not flag issues in code that was not changed by this PR.

**Pass 1 -- Code smells.** Identify code smells using the list below:

| Smell | Signs |
|-------|-------|
| **Long method** | Function > 30 lines, multiple levels of nesting |
| **Feature envy** | Method uses more data from another module than its own |
| **Data clumps** | Same group of parameters passed together repeatedly |
| **Primitive obsession** | Using strings/numbers instead of domain types |
| **Shotgun surgery** | One change requires edits across many files |
| **Divergent change** | One file changes for many unrelated reasons |
| **Dead code** | Unreachable or never-called code |
| **Debug/Dev code** | Code whose only purpose is debugging/development and that cannot be disabled |
| **Speculative generality** | Abstractions for hypothetical future needs |
| **Magic numbers/strings** | Hardcoded values without named constants |

**Pass 2 -- Solution analysis.** Understand the intent of the developer. Determine whether the solution is adequate. Decide whether this is the solution you would have implemented or whether there is a clearly better approach. Ensure the solution is split sensibly across files, modules, and functions. Very large functions or too many parameters should be avoided. You may read any local file needed to understand the broader architecture.

**Pass 3 -- Bug finding (diff-scoped).** Scan for obvious bugs. Focus only on the diff itself. Flag only significant bugs. Ignore nitpicks and likely false positives. Do not flag issues that you cannot validate from the diff itself.

**Pass 4 -- Bug finding (context-aware).** Look for problems in the introduced code using the full local codebase for context. This includes security issues, incorrect logic, misuse of APIs, wrong function signatures, missing error handling, and similar defects. Only flag issues that fall within the changed code, but use surrounding context to validate the findings.

After all 4 passes, deduplicate the findings and keep only the high-signal issues.

### Signal quality

CRITICAL: We only want **HIGH SIGNAL** issues. Flag issues where:
- The code will fail to compile or parse (syntax errors, type errors, missing imports, unresolved references)
- The code will definitely produce wrong results regardless of inputs (clear logic errors)
- Clear, unambiguous code smells where you can quote the exact rule being broken

Do **NOT** flag:
- Code style or quality concerns
- Potential issues that depend on specific inputs or state
- Subjective suggestions or improvements

If you are not certain an issue is real, do not flag it. False positives erode trust and waste reviewer time.

## Phase 3 -- CI check verification

Use the gitea skill to run `pr-checks` and retrieve the CI check results for this PR. If any checks are failing or pending, include them in the review findings so the developer is aware.

## Phase 4 -- Restore local state

Regardless of review outcome, restore the local git state:
- Check out the original branch that was active before the review.
- If a stash was created in Phase 1, pop it.
- If restoring the local state fails, clearly tell the user what failed and what the current git state is.

If you skipped checkout in Phase 1 because you were already on the PR branch, skip this phase.

## Phase 5 -- Report findings

Present a concise summary of the review findings to the user:

- If issues were found, list each issue with a brief description, the affected file and line, the category, and a confidence level.
- If CI checks are failing or pending, list them.
- If no issues were found, state: `No issues found. Checked for bugs and code smells.`

**IMPORTANT** After showing the list of issues to the user, ask whether they want you to post comments to the pull request directly. If not, **STOP** here. Otherwise continue to the next section.

### Post inline comments

For each issue found, post an inline comment to the pull request using the gitea skill (`pr-comment`) at the appropriate changed file and line:

- Provide a brief description of the issue.
- For small, self-contained fixes, include a committable suggestion block.
- For larger fixes (6+ lines, structural changes, or changes spanning multiple locations), describe the issue and suggested fix without a suggestion block.
- Never post a committable suggestion unless committing the suggestion fixes the issue entirely. If follow-up steps are required, do not leave a committable suggestion.
- Never post an inline comment on a line that is outside the PR diff.

**IMPORTANT** Always sign your reviews as Jean-Claude with an inspiring quote and a funny emoticon.
