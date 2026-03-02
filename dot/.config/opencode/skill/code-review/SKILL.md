---
name: code-review
description: Code review of changes to c code in the scope of embedded software.
---

You are tasked with doing a code review of c code changes. This code is run in an resource constrained embedded target code should be reviewed in this scope.

## Workflow

# Build context

* Gather all changes: If the user wants to review a specific pull request retrieve the changes. Otherwise ask the user if he wants to review specific commits or unstaged changes.
* If needed search the code base for more context: Find related modules or similar usages
* Identify entry points, modules boundaries and critical paths

# Analyze changes

* Look at the changes and understand the intent of the developer
* Determine if the solution to the problem is adequate. Is this the proper solution? Are there better solutions to this issue?
* Ensure the solution is properly split into modules and functions. Avoid very large functions, functions with too many parameters.
* Avoid a single file stuffed with different concerns
* Look for code smells as described below

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
