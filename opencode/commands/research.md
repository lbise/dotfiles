---
description: Research for a new feature/bugfix/refactor
---

# Research

Your role is to help the user prepare a document that includes all the essential information required to begin work on a new item.
The goal is to produce a self-contained document that another developer could pick up and start from without needing the additional information. You will conduct comprehensive research across the codebase to answer user questions by spawning parallel subagents and synthesizing their findings.

## Variables

USER_PROMPT: $ARGUMENTS
OUTPUT_PATH: `.workdoc/`

## Guidelines

* CRITICAL: YOUR ONLY JOB IS TO DOCUMENT AND EXPLAIN THE CODEBASE AS IT EXISTS TODAY
* You are creating a technical map/documentation of the existing system
* Always use parallel Task agents to maximize efficiency and minimize context usage
* Always run fresh codebase research - never rely solely on existing research documents
* Focus on finding concrete file paths and line numbers for developer reference
* Research documents should be self-contained with all necessary context
* Each subagent prompt should be specific and focused on read-only documentation operations
* Document cross-component connections and how systems interact
* Keep the main agent focused on synthesis, not deep file reading
* Have subagents document examples and usage patterns as they exist
* If user provides insufficient information, ask clarifying questions

## Workflow

### Step 0: Introduction

When this command is invoked, respond with:
```
I'm ready to research the codebase. Please provide your research question or area of interest, and I'll analyze it thoroughly by exploring relevant components and connections.
```

Then wait for the user's research query.

### Step 1: Analyze Inputs

1. Read any directly mentioned files first
    * **IMPORTANT**: Use the Read tool WITHOUT limit/offset parameters to read entire files
    * This ensures you have full context before decomposing the research
    * If the user provides any ticket references, read them and related tickets using the `~/.scripts/redmine.py view <ticket>`command

2. Read carefully the user input from `USER_PROMPT`
    * Break down the user's query into composable research areas
    * Take time to ultrathink about the underlying patterns, connections, and architectural implications the user might be seeking
    * Identify specific components, patterns, or concepts to investigate
    * Create a research plan using todowrite to track all subtasks
    * Consider which directories, files, or architectural patterns are relevant

3. **Spawn parallel sub-agent tasks for comprehensive research:**
   - Create multiple Task agents to research different aspects concurrently

   **For codebase research:**
   - Use the **codebase-locator** agent to find WHERE files and components live
   - Use the **codebase-analyzer** agent to understand HOW specific code works (without critiquing it)

   **IMPORTANT**: All agents are documentarians, not critics. They will describe what exists without suggesting improvements or identifying issues.

   The key is to use these agents intelligently:
   - Start with locator agents to find what exists
   - Then use analyzer agents on the most promising findings to document how they work
   - Run multiple agents in parallel when they're searching for different things
   - Each agent knows its job - just tell it what you're looking for
   - Don't write detailed prompts about HOW to search - the agents already know
   - Remind agents they are documenting, not evaluating or improving

4. **Wait for all sub-agents to complete and synthesize findings:**
   - IMPORTANT: Wait for ALL sub-agent tasks to complete before proceeding
   - Compile all sub-agent results (both codebase and thoughts findings)
   - Connect findings across different components
   - Include specific file paths and line numbers for reference
   - Highlight patterns, connections, and architectural decisions
   - Answer the user's specific questions with concrete evidence

### Step 2: Interactive Discussion

Ask specific, targeted questions based on the information gathered up to now in order to gather comprehensive context.

1. Ask the user questions to refine context
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
2. Identify gaps: Look for areas that could benefit from more detail or clarification and ask the user
3. Generally ask the user if he has any other meaningful information to add
4. Take a moment to think about how the user's answers affect the original request

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

### Step 4: Setup Development Environment

1. Create a new git branch, the name should start by the ticket number, if available, and be followed by a shortened form of the title using kebab case.
2. If a ticket was provided, set ticket status to "in progress" using the following command: `redmine.py set-status <ticket> "in progress"`

### Step 5: Document Creation

1. Create a subdirectory in `OUTPUT_PATH` to store all documents
    - Directory name should start by ticket number if provided followed by a short form subject using kebab case
2. Create a research document called research.md in the directory
3. The document must use the following format:

```markdown
---
date: [Current date and time with timezone in ISO format]
ticket: [Ticket number if provided, omit this field otherwise]
type: [Type of work]
git_commit: [Current commit hash]
branch: [Current branch name]
topic: "[User's Question/Topic]"
---

# Research: [User's Question/Topic]

## Research Question
[Original user query]

## Summary
[High-level documentation of what was found, answering the user's question by describing what exists]

## Detailed Findings

### [Component/Area 1]
- Description of what exists ([file.ext:line](link))
- How it connects to other components
- Current implementation details (without evaluation)

### [Component/Area 2]
...

## Code References
- `path/to/file.py:123` - Description of what's there
- `another/file.ts:45-67` - Description of the code block

## Logs
[List any error logs or messages if provided]

## Architecture Documentation
[Current patterns, conventions, and design implementations found in the codebase]

## Historical Context (from thoughts/)
[Relevant insights from thoughts/ directory with references]
- `thoughts/shared/something.md` - Historical decision about X
- `thoughts/local/notes.md` - Past exploration of Y
Note: Paths exclude "searchable/" even if found there

## Related Information
[Any related tickets, documents, or context]

## Open Questions
[Any areas that need further investigation]

## Notes
[Any additional notes for research/planning]
```

### Step 6: Verification

1. Review the document to ensure all critical information is captured
2. Check that the requirements are clear and achievable
3. Present a concise summary of findings to the user
    - Include key file references for easy navigation
    - Ask if they have follow-up questions or need clarification
4. Handle follow-up questions
    - If the user has follow-up questions, append to the same research document
    - Add a new section: `## Follow-up Research [timestamp]`
    - Spawn new sub-agents as needed for additional investigation
    - Continue updating the document

Use the todowrite tool to create a structured task list for the 6 steps above, marking each as pending initially.

## Report

* Short summary of the research conducted
* Display the full path to the research document
* Ask the user to review the research thoroughly and to fix or improve it if required
* Inform the user the next step is to create the implementation plan using the /plan [path/to/research] command
