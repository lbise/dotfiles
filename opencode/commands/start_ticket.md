---
description: Start working on a ticket
agent: build
---

# Start ticket

Setup the environment to start working on a new ticket. Your goal is to create a starting document with enough context NOT an implementation plan.

## Variables

TICKET: $ARGUMENTS
PLAN_OUTPUT: `ai_plans/`

## Workflow

1. Create a new git branch, the name should start by the ticket number and be followed by a shortened form of the title using kebab case.
2. Set ticket status to "in progress" using the following command: workflow.py set-status `TICKET` "in progress"
3. Use the shell tool workflow.py view `TICKET` to get the ticket information
4. If the ticket contains any logs or code blocks write them as is in code blocks
5. Ask specific, targeted questions based on the ticket information to gather comprehensive context. Add these information to the Additional Information section. Do not actually write the implementation plan
6. Using the ticket content and user provided context, find and list the important files related to this issue
7. Create a new markdown document in `PLAN_OUTPUT/TICKET-name-of-plan.md` use the following template structure

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

### Additional Information
[Add optional additional information from the ticket or provided by the user]

# Implementation Plan

TODO

```

## Report

* Summarize what you just did
* Display the full path to the plan document

Tell user it should do the following: Create the plan: /plan `PLAN_OUTPUT/TICKET-name-of-plan.md` (In a new session!)
