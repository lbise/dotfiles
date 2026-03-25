---
name: pull-request-review
description: Code review of a pull request
---

Provide a code review for the given pull request.

$ARGUMENTS

Before starting ensure the user provided a pull request number. If that is not the case or what you need to review is unclear, **STOP** and ask the user to clarify.

## Phase 1 -- Setup

1. Load the **gitea** skill (`@.agents/skills/gitea/SKILL.md`). Use it for all Gitea interactions throughout this review.

2. Fetch the pull request information with `pr-show`. Verify that the pull request has not already been reviewed by checking `pr-comments`. If it was already reviewed, **STOP** and inform the user.

3. Retrieve the list of changed files with `pr-files`. If the change set is large and will need to be split into work chunks, **STOP** and tell the user how you will split the work. Wait for agreement before proceeding. The idea is to group several files together and perform the usual code review on each chunk to prevent having to deal with too much context at once.

4. **Checkout the PR branch locally.** This gives you full codebase context during review.

    * Determine the PR's head branch and base branch from the `pr-show` output.
    * Check the current git branch (`git branch --show-current`).
    * **If already on the PR branch:** skip the checkout. Just make sure the branch is up to date (`git pull`).
    * **If on a different branch:** stash any uncommitted changes (`git stash --include-untracked`), then fetch and checkout the PR branch (`git fetch origin <head_branch> && git checkout <head_branch>`). Remember the original branch name so you can restore it later.

5. Generate the scoped diff locally:
    ```
    git diff <base_branch>...<head_branch>
    ```
    This diff defines exactly which files and lines are part of the PR. All review findings **must** be scoped to these lines.

## Phase 2 -- Parallel code review

Launch 4 agents in parallel to independently review the changes. Each agent should return the list of issues, where each issue includes a description and the reason it was flagged (e.g. "code smell", "bug").

**Context rules for all agents:**
- Agents **CAN** read local files for surrounding context (imports, type definitions, function signatures, module structure).
- Agents **MUST** only flag issues on lines that are part of the PR diff generated in Phase 1.
- Do not flag issues in code that was not changed by this PR.

**Agent 1 -- Code smells.** Identify code smells using the list below:

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

**Agent 2 -- Solution analysis.** Understand the intent of the developer. Determine if the solution is adequate. Decide if the solution is the same one you would have implemented or if there is a better approach. Ensure the solution is properly split into files, modules, and functions. Very large functions or too many parameters should be avoided. The agent can read any local file to understand the broader architecture.

**Agent 3 -- Bug finding (diff-scoped).** Scan for obvious bugs. Focus only on the diff itself. Flag only significant bugs; ignore nitpicks and likely false positives. Do not flag issues that you cannot validate without looking at context outside of the git diff.

**Agent 4 -- Bug finding (context-aware).** Look for problems in the introduced code using the full local codebase for context. This includes security issues, incorrect logic, misuse of APIs, wrong function signatures, missing error handling, etc. Only flag issues that fall within the changed code, but use surrounding context to validate findings.

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
- Checkout the original branch that was active before the review.
- If a stash was created in Phase 1, pop it (`git stash pop`).

If you skipped checkout in Phase 1 (already on the PR branch), skip this phase.

## Phase 5 -- Report findings

Output a summary of the review findings to the terminal:

* If issues were found, list each issue with a brief description.
* If CI checks are failing, list them.
* If no issues were found, state: "No issues found. Checked for bugs and code smells."

**IMPORTANT** At this point ask the user if he wishes to post comments to the pull request directly. If not, **STOP** here. Otherwise continue to the next section.

### Post inline comments

For each issue found, post an in-line comment to the pull request using the gitea skill (`pr-comment`) at the appropriate file and line:

* Provide a brief description of the issue.
* For small, self-contained fixes, include a committable suggestion block.
* For larger fixes (6+ lines, structural changes, or changes spanning multiple locations), describe the issue and suggested fix without a suggestion block.
* Never post a committable suggestion UNLESS committing the suggestion fixes the issue entirely. If follow-up steps are required, do not leave a committable suggestion.

**IMPORTANT** You must always sign your reviews as Jean-Claude with an inspiring quote and a funny emoticon.
