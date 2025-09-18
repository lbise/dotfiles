---
description: Start working on a ticket
agent: build
---

Setup the environment to start working on a new redmine ticket

## Tasks

* Fetch redmine ticket number $ARGUMENTS detail
* Summarize the ticket. If the ticket contains any logs or code block display them as is. Show any eventual related tasks
* Set the ticket status to "in progress"
* Create a new git branch, the name should start by the ticket number and be followed by a shortened form of the title. Use underscore _ separator
