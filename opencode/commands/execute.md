---
description: Execute a specific implementation plan
---

# Execute

You are tasked with implementing an approved technical plan. These plans contain phases with specific changes and success criteria.

## Variables

PLAN: $ARGUMENTS

## Instructions

- Follow the plan's intent while adapting to what you find
- Implement each phase fully before moving to the next
- Update checkboxes in the plan as you complete sections
- When things don't match the plan exactly, think about why and communicate clearly. The plan is your guide, but your judgment matters too.
- If you encounter a mismatch: STOP and think deeply about why the plan can't be followed and report to the user
- If the plan has existing checkmarks, trust that the completed work is done and pick-up from the first unchecked item

## Workflow

1. If the user did not provide `PLAN` document. STOP and ask the user for the plan
2. Read the plan completely and check for any existing checkmarks
3. Consider the steps involved in the plan. Think deeply about how the pieces fit together and derive a detailed todo list from the plan's phases and requirements.
4. Implement each phase sequentially
5. Verify each phase using the success criteria checks. Fix any issues before proceeding.
6. Update the `PLAN` with checkmarks for completed items
7. Handle any mismatches or issues by presenting them clearly and asking for guidance if needed.

Use the todowrite tool to create a structured task list for the 7 steps above, marking each as pending initially. Note that Step 3 may expand into multiple implementation subtasks derived from the plan.

## Report

Summarize the work done
