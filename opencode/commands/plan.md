---
description: Create a concise engineering implementation plan based on user requirements and save it
agent: build
---

# Plan

Create a detailed implementation plan for a new feature, bugfix, or refactor based on user requirements. Use the available information provided in the `PLAN` document. Analyze the request, think through the implementation approach, and add comprehensive specification to the `PLAN` document that can be used as a blueprint for actual development work.

## Variables

PLAN: $ARGUMENTS

## Instructions

- Carefully analyze the user's input provided in `PLAN`
- Think deeply about the best approach to implement the requested functionality or solve the problem
- Be Skeptical: Question vague requirements, identify potential issues and ask "why" and "what about"
- Be Interactive: Do not write the full plan in one shot, allow course corrections, work collaboratively
- Track Progress: Use `todowrite`tool to track planning tasks
- Ensure the plan is detailed enough that another developer could follow it to implement the solution
- Include code examples or pseudo-code where appropriate to clarify complex concepts
- Structure the document with clear sections and proper markdown formatting

## Workflow

1. If `PLAN` is not provided. Stop directly and ask user to provide the missing input.
2. Start by reading the provided plan using the read tool. Read the document completely so you have the full context.
2. Analyze Requirements - THINK HARD and parse the document content to understand the core problem and desired outcome
3. Design Solution - Develop technical approach including architecture decisions and implementation strategy
    - If there are multiple options, present all options with pros and cons and any open questions and ask the user which approach should be taken
4. Validate Plan - Propose a plan structure listing the main phases and what it accomplishes.
    - Ask the user to confirm that the plan makes sense before continuing
5. Document Plan - Structure a comprehensive markdown document using the following structure:

```markdown
# Implementation Plan

## Overview
[Brief description of what we're implementing and why]

## Current State Analysis
[What exists now, what's missing, key constraints discovered]

## Desired End State
[A Specification of the desired end state after this plan is complete, and how to verify it]

### Key Discoveries:
- [Important finding with file:line reference]
- [Pattern to follow]
- [Constraint to work within]

## Implementation Approach
[High-level strategy and reasoning]

## Task 1: [Descriptive Name] [TODO]

### Overview
[What this task accomplishes]

### Changes Required:

#### 1. [Component/File Group]
**File**: `path/to/file.ext`
**Changes**: [Summary of changes]

[Describe what exactly needs to be done]

```[language]
// Specific code to add/modify
```

### Success Criteria:

#### Automated Verification:
- [ ] Unit tests pass: `build.py -p prj/tst/unity_host/dmtx -x`

#### Hardware-in-the-loop Tests:
- [ ] Integration tests pass
- [ ] Sanity tests pass

---

List all tasks similar as before

---

## Testing Strategy

### Unit Tests:
- [What to test]
- [Key edge cases]

### Integration Tests:
- [End-to-end scenarios]

```

6. Save & Report - Write the plan to `PLAN` and provide a summary of the key components
7. Review - Ask the user to review the plan and let you know if any changes must be done
    - Iterate based on feedback until the plan is mature
    - Do not leave any open questions in the final plan, if you encounter any just STOP and ask for clarification
    - The implementation plan must be complete and actionable
    - Continue until the user is satisfied

## Report

After creating and saving the implementation plan, provide a concise report with the following format:

```markdown
File: `PLAN`
Topic: [Brief description of what the plan covers]
Key Components:
- [main component 1]
- [main component 2]
- [main component 3]
...
```

Next: Execute the plan: /execute `PLAN` (In a new session!)
