---
description: Start working on a ticket
agent: build
---

# Start ticket

Setup the environment to start working on a new ticket.

## Variables

TICKET: $ARGUMENTS
TASK_OUTPUT: `ai_tasks/`

## Workflow

1. Create a new git branch, the name should start by the ticket number and be followed by a shortened form of the title using kebab case.
2. Set ticket status to "in progress" using the following command: workflow.py set-status `TICKET` "in progress"
3. Use the shell tool workflow.py view `TICKET` to get the ticket information
4. If the ticket contains any logs or code blocks write them as is in code blocks
5. Ask specific, targeted questions based on the ticket information to gather comprehensive context
6. Using the ticket content and user provided context, find and list the important files related to this issue
7. Create a new markdown document in `TASK_OUTPUT/TICKET-name-of-plan.md` use the following template structure:

```markdown
---
ticket: [TICKET]
created: [ticket ISO date]
keywords: [comma-separated keywords for research]
---

# Ticket Details
[Add relevant information from the ticket]

## Ticket Summary
[Add a summary of the ticket]

### Key Issues
[List key issues you identified from the ticket and questions]

### Files
[List important files related to this issue]

# Implementation Plan

TODO

```

## Report

* Summarize what you just did
* Display the full path to the plan document

Next: Create the plan: /plan `PLAN` (In a new session!)
