---
name: redmine
description: Access and edit tickets on redmine
---

Redmine is a ticketing system used to report bugs and track feature implementation.

## Redmine

Redmine can be accessed by using the redmine.py python script. It is accessible directly from the PATH.

The scripts works with a series of subcommands invoked like this: redmine.py <subcommand>

Important subcommands:

* summary : Lists all tickets assigned to the current user
* view <ticket> : View ticket details (includes attachments listing with download URLs)
* note <ticket> <note> : Add a new note to a ticket
* set-status <ticket> <status> : Set the ticket status from the following: "in progress", "resolved", "closed", "monitoring"
* download-attachment <ticket> [--filename <name>] [--dest <dir>] : Download attachment(s) from a ticket to a local directory for viewing. Use --filename to filter by filename (substring match). Files are saved to /tmp/redmine_attachments/<ticket>/ by default.

** IMPORTANT ** : Redmine does not support markdown syntax. When writing notes take this into account.
The format is the following:

* Heading: h1. <Title>, h2. <Title> or h3. <Title>
* Link to issues : #ticket and ##ticket (include number, name and subject)
* External link : [Website name](url)
* Code blocks/Pre formatted text : <pre>Text</pre>
* Bold : *bold*
* Italic : _italic_
* Underline : +underline+
* Strikethrough : -Strikethrough-

## Examples

* View ticket #1234 : redmine.py view 1234
* Add note to ticket 5678 : redmine.py note 5678 "This is a new note"
* Set status to in progress for ticket 666 : redmine.py set-status 666 "in progress"
* Download all attachments from ticket 1234 : redmine.py download-attachment 1234
* Download a specific attachment : redmine.py download-attachment 1234 --filename "diagram.png"
* Download attachments to a custom directory : redmine.py download-attachment 1234 --dest /path/to/dir

## Viewing Images from Tickets

When a ticket contains images (referenced as `!filename.png!` in the description), the `view` command will list them in the Attachments section with download URLs. To actually view the image content, use the `download-attachment` command to download it locally, then use the Read tool to view the downloaded file.
