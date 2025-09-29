---
description: Draft a spec document
---

# Draft Spec

Your role is to help the user prepare a document that includes all the essential information required to begin work on a new item.
The goal is to produce a self-contained document that another developer could pick up and start from without needing the additional information.

## Variables

USER_PROMPT: $ARGUMENTS
OUTPUT_PATH: `workdoc/`

## Guidelines

* Be thorough: Ask follow-up questions to clarify vague points
* If user provides insufficient information, ask clarifying questions
* If scope seems too broad, suggest breaking into multiple tickets
* Always validate that the ticket has enough information for planning to begin

## Workflow

### Step 1: Analyze Inputs

1. Read carefully the user input from `USER_PROMPT`
2. If the user provided a redmine ticket use the following command to retrieve the ticket content: `redmine.py view <ticket`
3. If the ticket contains related tickets, they can be retrieved with the same command
4. Identify the type of work (feature, bugfix, refactor)
5. Extract initial keywords and patterns from user input
    * Module or service names, file patterns, function names
    * Error messages, symptoms, behaviors

### Step 2: Interactive Discussion

Ask specific, targeted questions based on the information gathered up to now in order to gather comprehensive context.

1. Review known information
2. Ask the user questions to refine context
    * For bugs:
        - What specific behavior are you seeing?
        - What should happen instead?
        - Steps to produce?
        - Any error messages or logs?
    * For features:
        - What problem does this solve for users?
    * For refactors:
        - What specific code or architecture needs improvement?
        - What would be the ideal state after cleanup?
        - Any specific patterns or anti-patterns to address?
    * Continue asking until either (a) all key sections of the spec can be filled in, or (b) the user indicates no more info is available.
4. Identify gaps: Look for areas that could benefit from more detail or clarification and ask the user
5. Generally ask the user if he has any other meaningful information to add
6. Take a moment to think about how the user's answers affect the original request

### Step 3: Context Extraction

Extract and organize information

1. Keywords
    - Module names, function names
    - File patterns, directory structures
    - Error messages, log patterns

2. Patterns to investigate
    - Code patterns that might be related
    - Architectural patterns to examine
    - Testing patterns to consider
    - Integration patterns with other systems

### Step 4: Document Creation

1. Create a subdirectory in `OUTPUT_PATH` to store all documents
    - Directory name should start by ticket number if provided followed by a short form subject using kebab case
2. Create a specification document in the directory. The name should start by the ticket number if provided followed by a short form subject in kebab case
3. The document must use the following format:

```markdown
---
ticket: [Ticket number if provided, omit this field otherwise]
created: [Document creation ISO date]
type: [Type of work]
---

# [Descriptive Title]
[short description of the work to be done]

## Description
[Clear, comprehensive description of the issue/feature/debt]

## Context
[Contextual information]

### Logs
[List any error logs or messages if provided]

### Key Files and Functions
[List important files and functions]

## Requirements
[List of requirements]

## Current State
[What currently exists, if anything]

## Desired State
[What should exist after implementation]

## Research Context
[Information specifically for research agents]

### Keywords to Search
- [keyword1] - [why relevant]
- [keyword2] - [why relevant]

### Key Decisions Made
- [decision1] - [rationale]
- [decision2] - [rationale]

## Acceptance Criteria
[List of acceptance criterias]

### Automated Verification
- [ ] [Test command or check]
- [ ] [Another automated check]

### Manual Verification
- [ ] [Manual test step]
- [ ] [Another manual check]

## Related Information
[Any related tickets, documents, or context]

## Notes
[Any additional notes, open points or questions for research/planning]
```

### Step 5: Verification

1. Review the document to ensure all critical information is captured
2. Check that the requirements are clear and achievable

### Step 6: Setup Development Environment

1. Create a new git branch, the name should start by the ticket number, if available, and be followed by a shortened form of the title using kebab case.
2. If a ticket was provided, set ticket status to "in progress" using the following command: `redmine.py set-status <ticket> "in progress"`

Use the todowrite tool to create a structured task list for the 6 steps above, marking each as pending initially.

## Report

* Summarize what you just did
* Display the full path to the plan document
* Inform the user:
    - That the document should be reviewed and improved if needed
    - To then execute the planning phase using: `/plan <document>`
