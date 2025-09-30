---
description: Implement a specific implementation plan
---

# Implement

Your task is to implement the specified software modifications following the provided implementation plan.

## Variables

PLAN: $ARGUMENTS

## Instructions

## Workflow

### Step 1: Initial Setup

1. If no implementation plan `PLAN` was provided, stop and ask the user to provide one
2. Read the `PLAN` and all files mentioned in it
    - **Read files fully** - never use limit/offset parameters, you need complete context
    - Think deeply about how the pieces fit together
    - If some part of the `PLAN` are not clear, read research.md for additional context
3. If a tasks.md file exists in the `PLAN` folder, read it fully. This file contains the current status of the plan tasks.
4. If tasks.md does not exists, create it using information from `PLAN` with the following format:
```markdown
# Task List
[Short summary of the goal of the plan]

## Phase 1: [Phase Name]

- [ ] 1.1. Subtask #1
    - Additional subtask 1.1 detail (optional)
- [ ] 1.2. Subtask #2
    - Additional subtask 1.1 detail (optional)
```
5. Using the todowrite tool create a list for all the tasks that are not yet checked

### Step 2: Implementation

1. Start implementing the next task that is not checked
    - Follow the plan instructions but adapt to the actual codebase context
    - Verify that your changes integrate correctly
2. Ensure the implementation matches the plan. The plan is your guide
3. If you encounter a mismatch between the plan and reality:
    - Stop and think carefully about why the plan cannot be followed
    - Report the issue to the user clearly, and request guidance before continuing
    - Do not proceed with assumptions without approval
4. After a task is implemented, validate it against its success criteria
    - Fix any issues before moving on
5. Once a task is complete, check it off in the tasks.md file
6. Continue with the next unchecked task
    - Each phase must be fully completed before advancing to the next

## Report

* Provide a short summary of the current implementation status
* Display the full path to the tasks document
