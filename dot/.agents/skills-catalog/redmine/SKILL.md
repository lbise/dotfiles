---
name: redmine
description: Access and manage tickets on Redmine
---

# Redmine Skill

Pure Redmine API wrapper. No side effects outside Redmine - no git, no filesystem changes.

## Usage

Redmine can be accessed by using the [redmine script](./redmine.py).

Invoke the script like this:
```bash
python3 ./redmine.py <command> [options]
```

## Commands

### view - View ticket details

```
python3 ./redmine.py view <ticket_number> [--history]
```

- `--history` : Include field change history (not just comments)
- Shows ticket metadata (status, priority, assignee, dates)
- Shows custom fields and their values
- Shows all comments/notes on the ticket
- Shows attachments (ID, filename, size, content type)
- Shows parent issues, subtasks, and related issues (if any)

### summary - List tickets assigned to current user

```
python3 ./redmine.py summary [--status <filter>] [--priority <filter>]
```

- `--status` : Filter by status (comma-separated). E.g., `"in progress,resolved"`
- `--priority` : Filter by priority (comma-separated). E.g., `"high,urgent"`

### note - Add a note to a ticket

```
python3 ./redmine.py note <ticket_number> "<note_text>"
```

### set-status - Change ticket status

```
python3 ./redmine.py set-status <ticket_number> "<status>"
```

Available statuses: `new`, `in progress`, `resolved`, `feedback`, `closed`, `rejected`, `monitoring`

### set-description - Update ticket description

```
python3 ./redmine.py set-description <ticket_number> "<description>"
```

Update the ticket description. Uses Markdown format (see formatting section below).

### set-field - Update a custom field

```
python3 ./redmine.py set-field <ticket_number> "<field_name>" "<value>"
```

Update a custom field value. Field name is case-insensitive (e.g., "Pull request(s)", "External Ticket(s)").

### attachment - Download attachment(s) from a ticket

```
python3 ./redmine.py attachment <ticket_number> [--filename "<name>"] [--id <attachment_id>] [--output-dir "<dir>"]
```

- `--filename` : Download a specific attachment by filename
- `--id` : Download a specific attachment by ID (shown in `view` output)
- `--output-dir` : Directory to save files (default: current directory)
- Without `--filename` or `--id`, downloads all attachments from the ticket

### report - Generate HTML report

```
python3 ./redmine.py report
```

Outputs HTML list of "In Progress" and "Resolved" tickets for the current user.

### create-ticket - Create a new ticket

```
python3 ./redmine.py create-ticket --subject "<title>" --project "<project_id>" --description "<description>" [options]
```

- `--subject` : Ticket subject/title (required)
- `--project` : Project ID or identifier (required)
- `--description` : Ticket description in Markdown format (optional)
- `--assigned-to` : User ID or login to assign the ticket to (optional)
- `--priority` : Priority level - `low`, `normal`, `high`, `urgent`, `immediate` (optional)
- `--parent` : Parent ticket number (optional)
- `--category` : Category ID or name (required for some projects)
- `--custom-field` : Custom field name and value (repeatable). E.g., `--custom-field "Pull request(s)" "url"`

Returns the newly created ticket number and URL.

## Writing Ticket Descriptions

Write like you're explaining the problem to a colleague at a whiteboard, not drafting a contract.
A ticket is a *starting point* for work, not a complete specification.

**Do:**
- Start with motivation: "We need to...", "Goal is to...", "In order to..."
- State the essential problem and why it matters
- Include concrete examples or error traces when relevant
- Link to related tickets with `#1234` - don't repeat their content
- Assume shared domain context (don't explain what SHAPI, DmTx, etc. are)
- Leave room for dialogue - the comments section exists for a reason

**Don't:**
- Write formal specification documents with "Requirements", "Scope", "Background" sections
- Over-explain every detail - some incompleteness is natural
- Be overly polished - minor rough edges are fine ("one scenario we want to test is...")
- Prescribe implementation unless truly necessary - focus on the problem, not the solution

**Tone examples from real tickets:**
- "Goal is to have an option (for test purpose) to bypass the pa/lna completely"
- "We need to have a few system tests that cover the wacp beacon queue."
- "This has been observed in various runs, in to4 as well as to5."

## Redmine Text Formatting

Redmine uses standard Markdown (GitHub-flavored). The only Redmine-specific
syntax is ticket linking: `#1234` (link) or `##1234` (link with subject).

## Examples

```bash
# View ticket with full history
python3 ./redmine.py view 1234 --history

# List only in-progress tickets
python3 ./redmine.py summary --status "in progress"

# Add a note (Markdown format)
python3 ./redmine.py note 1234 "Fixed in commit abc123. See #5678 for related work."

# Mark ticket as resolved
python3 ./redmine.py set-status 1234 "resolved"

# Set Pull request(s) field
python3 ./redmine.py set-field 1234 "Pull request(s)" "https://ch03git.phonak.com/andromeda/rom/pulls/5167"

# Download all attachments from a ticket
python3 ./redmine.py attachment 1234

# Download a specific attachment by filename
python3 ./redmine.py attachment 1234 --filename "diagram.png"

# Download a specific attachment by ID to a custom directory
python3 ./redmine.py attachment 1234 --id 22583 --output-dir /tmp

# Create a new ticket
python3 ./redmine.py create-ticket \
  --subject "[DmTx AFH] Fix channel selection bias" \
  --project "workpackages" \
  --description "## Problem\\n\\nThe filter selects leftmost channel when equal maxima occur." \
  --assigned-to "13nlopez" \
  --priority "normal" \
  --parent 28813 \
  --category "224"

# Generate weekly report
python3 ./redmine.py report
```

## Environment Variables

- `REDMINE_URL` : Base URL of the Redmine instance (required)
- `REDMINE_API_KEY` : API key for authentication (or use `--api-key`)
