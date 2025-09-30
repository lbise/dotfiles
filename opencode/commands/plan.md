---
description: Create an implementation plan
---

# Plan

Create a detailed implementation plan for a new feature, bugfix, or refactor based on user inputs. You should be skeptical, thorough, and work collaboratively with the user to produce high-quality technical specifications.

## Variables

RESEARCH: $ARGUMENTS

## Instructions

- CRITICAL: YOUR ONLY JOB IS TO CREATE THE IMPLEMENTATION PLAN BASED ON RESEARCH
- Think deeply about the best approach to implement the requested functionality or solve the problem
- Be Skeptical: Question vague requirements, identify potential issues and ask "why" and "what about"
- Be Interactive: Do not write the full plan in one shot, allow course corrections, work collaboratively
- Ensure the plan is detailed enough that another developer could follow it to implement the solution
- Include code examples or pseudo-code where appropriate to clarify complex concepts
- Structure the document with clear sections and proper markdown formatting
- If you encounter open questions during planning, STOP
- The implementation plan must be complete and actionable
- Every decision must be made before finalizing the plan

## Workflow

### Step 0: Introduction

1. Check if `RESEARCH` document is provided.
    - If a file path was provided as a parameter, skip the default message
    - Immediately read any provided files FULLY
    - Begin the analysis process

2. If not parameters were provided respond with:
```
I'll help you create a detailed implementation plan. Let me start by understanding what we're building.

Please provide:
1. The task/ticket description (or reference to a ticket file)
2. Any relevant context, constraints, or specific requirements
3. Links to related research or previous implementations

I'll analyze this information and work with you to create a comprehensive plan.

Tip: You can also invoke this command with a ticket file directly: `/create_plan thoughts/allison/tickets/eng_1234.md`
For deeper analysis, try: `/create_plan think deeply about thoughts/allison/tickets/eng_1234.md`
```

Then wait for the user's input.

### Step 1: Gather Context and Initial Analysis

1. **Read all mentioned files immediately and FULLY**:
    - Read all relevant files reported in the plan document or by the user
    - **IMPORTANT**: Use the Read tool WITHOUT limit/offset parameters to read entire files

2. **Analyze and verify understanding**:
   - Cross-reference the ticket requirements with actual code
   - Identify any discrepancies or misunderstandings
   - Note assumptions that need verification
   - Determine true scope based on codebase reality

3. **Present informed understanding and focused questions**:
   ```
   Based on the available information, I understand we need to [accurate summary].

   I've found that:
   - [Current implementation detail with file:line reference]
   - [Relevant pattern or constraint discovered]
   - [Potential complexity or edge case identified]

   Questions that my research couldn't answer:
   - [Specific technical question that requires human judgment]
   - [Business logic clarification]
   - [Design preference that affects implementation]
   ```

   Only ask questions that you genuinely cannot answer through code investigation.

### Step 2: Research & Discovery

After getting initial clarifications:

1. **If the user corrects any misunderstanding**:
   - DO NOT just accept the correction
   - Spawn new research tasks to verify the correct information
   - Read the specific files/directories they mention
   - Only proceed once you've verified the facts yourself

2. **Create a research todo list** using todowrite to track exploration tasks

3. **Spawn parallel sub-tasks for comprehensive research**:
   - Create multiple Task agents to research different aspects concurrently
   - Use the right agent for each type of research:

   **For deeper investigation:**
   - **codebase-locator** - To find more specific files (e.g., "find all files that handle [specific component]")
   - **codebase-analyzer** - To understand implementation details (e.g., "analyze how [system] works")
   - **codebase-pattern-finder** - To find similar features we can model after

   Each agent knows how to:
   - Find the right files and code patterns
   - Identify conventions and patterns to follow
   - Look for integration points and dependencies
   - Return specific file:line references
   - Find tests and examples

3. **Wait for ALL sub-tasks to complete** before proceeding

4. **Present findings and design options**:
   ```
   Based on my research, here's what I found:

   **Current State:**
   - [Key discovery about existing code]
   - [Pattern or convention to follow]

   **Design Options:**
   1. [Option A] - [pros/cons]
   2. [Option B] - [pros/cons]

   **Open Questions:**
   - [Technical uncertainty]
   - [Design decision needed]

   Which approach aligns best with your vision?
   ```

### Step 3: Plan Structure Development

Once aligned on approach:

1. **Create initial plan outline**:
   ```
   Here's my proposed plan structure:

   ## Overview
   [1-2 sentence summary]

   ## Implementation Phases:
   1. [Phase name] - [what it accomplishes]
   2. [Phase name] - [what it accomplishes]
   3. [Phase name] - [what it accomplishes]

   Does this phasing make sense? Should I adjust the order or granularity?
   ```

2. **Get feedback on structure** before writing details

### Step 4: Detailed Plan Writing

After structure approval:

1. Create the plan in the same directory as the research.md file and call it plan.md
2. Document Plan - Structure a comprehensive markdown document using the following structure:
```markdown
# Implementation Plan [Descriptive name]

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

## What We're NOT Doing

[Explicitly list out-of-scope items to prevent scope creep]

## Implementation Approach
[High-level strategy and reasoning]

## Phase 1: [Descriptive Name]

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

#### Manual Verification:
- [ ] Integration tests pass
- [ ] Sanity tests pass

---

## Phase 2: [Descriptive Name]

[Similar structure with both automated and manual success criteria...]

---

## Testing Strategy

### Unit Tests:
- [What to test]
- [Key edge cases]

### Integration Tests:
- [End-to-end scenarios]

### Manual Testing Steps:
1. [Specific step to verify feature]
2. [Another verification step]
3. [Edge case to test manually]

## References

- Original ticket:
- Related research: `research.md`
- Similar implementation: `[file:line]`
```

### Step 5: Review

1. **Present the draft plan location**:
```
I've created the initial implementation plan at:
`path/to/plan.md`

Please review it and let me know:
- Are the phases properly scoped?
- Are the success criteria specific enough?
- Any technical details that need adjustment?
- Missing edge cases or considerations?
```

2. **Iterate based on feedback** - be ready to:
   - Add missing phases
   - Adjust technical approach
   - Clarify success criteria (both automated and manual)
   - Add/remove scope items

3. **Continue refining** until the user is satisfied

## Report

After creating and saving the implementation plan, provide a concise report with the following format:

```markdown
File: `path/to/plan`
Topic: [Brief description of what the plan covers]
Key Components:
- [main component 1]
- [main component 2]
- [main component 3]
...
```

Use the todowrite tool to create a structured task list for the 5 steps above, marking each as pending initially.

## Report

* Short summary of the implementation plan
* Display the full path to the plan document
* Ask the user to review the plan thoroughly and to fix or improve it if required
* Inform the user the next step is to implement the plan using the /implement [path/to/plan] command
