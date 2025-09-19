---
description: Start working on a ticket
agent: build
---

# Start ticket

Setup the environment to start working on a new ticket.

## Variables

TICKET: $ARGUMENTS
TASK_OUTPUT: 'ai_tasks/'

## Workflow

* Create a new git branch, the name should start by the ticket number and be followed by a shortened form of the title using kebab case.
* Set ticket status to "in progress" using the following command: workflow.py set-status TICKET "in progress"
* Use the shell tool workflow.py view 'TICKET' to get the ticket information
* If the ticket contains any logs or code blocks write them as is in code blocks.
* Create a new markdown document in 'TASK_OUTPUT/TICKET-name-of-plan.md' use the following template structure:

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
[List key issues you identified from the ticket]

# Requirements

TODO

# Tasks

TODO

# Tests

TODO

```

## Report

* Summarize what you just did
* Display the full path to the plan document
