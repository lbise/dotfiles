---
description: Review changes made and verify the plan was followed.
---

# Review

You are tasked with validating that an implementation plan was correctly executed, verifying all success criteria and identifying any deviations or issues.

## Variables

PLAN: $ARGUMENTS

## Workflow

1. If `PLAN` is not provided. Stop directly and ask user to provide the missing input.
2. Start by reading the provided plan using the read tool. Read the document completely so you have the full context.
3. Identify what should have changed. List all files that should be modified. Note all success criteria.
4. For each task in the plan:
    - Check for checkmarks in the plan
    - Verify the actual code matches claimed completion
    - Think  deeply about edge cases. Were error conditions handled? Are there missing validations? Could the implementation break existing functionalities?

## Report

For each tasks reviewed, print the subject and the status of the review
