---
name: code-review
description: Code review of a pull request
---

Provide a code review for the given pull request.

$ARGUMENTS

Before starting ensure the user provided a pull request, if that is not the case or what you need to review is unclear. **STOP** and ask the user to clarify.

To do the code review proceed as follows:

1. Fetch the pull request information and ALL the code changes. Create a summary and list ALL changes mentioning the absolute file path as well as the line numbers that were changed and the diff itself. It is important that this summary contains the full change, this will be useful later to provide to subagents. **IMPORTANT** Focus only on the changes made by the pull request do **NOT** attempt to search the local files as they might differ from those of the pull request.

2.  Launch 4 agents in parallel to independently review the changes. Each agent should return the list of issues, where each issue includes a description and the reason it was flagged (e.g. "code smell", "bug"). Provide the full pull request summary you made previously. **IMPORTANT** Agents should **ONLY** analyze the changes you provided and not attempt to search local files. The agents should do the following:

    Agent 1: Identify code smells using the list provided below
    | Smell | Signs |
    |-------|-------|
    | **Long method** | Function > 30 lines, multiple levels of nesting |
    | **Feature envy** | Method uses more data from another module than its own |
    | **Data clumps** | Same group of parameters passed together repeatedly |
    | **Primitive obsession** | Using strings/numbers instead of domain types |
    | **Shotgun surgery** | One change requires edits across many files |
    | **Divergent change** | One file changes for many unrelated reasons |
    | **Dead code** | Unreachable or never-called code |
    | **Speculative generality** | Abstractions for hypothetical future needs |
    | **Magic numbers/strings** | Hardcoded values without named constants |

    Agent 2: Solution analysis. Understand the intent of the developer. Determine if the solution of the problem is adequate or if there is a better solution.
    Ensure the solution is properly split into files, modules and functions. Very large functions or too manay parameters should be avoided.

    Agent 3: Bug finding agent (parallel subagent with agent 4) Scan for obvious bugs. Focus only on the diff itself without reading extra context. Flag only significant bugs; ignore nitpicks and likely false positives. Do not flag issues that you cannot validate without looking at context outside of the git diff.

    Agent 4: Bug finding agent (parallel subagent with agent 3) Look for problems that exist in the introduced code. This could be security issues, incorrect logic, etc. Only look for issues that fall within the changed code.

    CRITICAL: We only want HIGH SIGNAL issues. Flag issues where:
    - The code will fail to compile or parse (syntax errors, type errors, missing imports, unresolved references)
    - The code will definitely produce wrong results regardless of inputs (clear logic errors)
    - Clear, unambiguous code smells where you can quote the exact rule being broken

    Do NOT flag:
    - Code style or quality concerns
    - Potential issues that depend on specific inputs or state
    - Subjective suggestions or improvements

    If you are not certain an issue is real, do not flag it. False positives erode trust and waste reviewer time.

3. Output a summary of the review findings to the terminal:

    * If issues were found, list each issue with a brief description.
    * If no issues were found, state: "No issues found. Checked for bugs and code smells."

**IMPORTANT** At this point ask the user if he wishes to post comments to the pull request directly. If not **STOP** here. Otherwise continue to the next section.

4. Report findings

    * For each issue found, post an in-line comment to the pull request in the appropriate file and line.
    * Once all issues have been posted at the correct line and file add a small general comment to the pull request with the summary of the review
