---
name: confluence
description: Fetch and read content from Confluence wiki pages
---

Confluence is a wiki system used for documentation and knowledge sharing.

## Confluence CLI

Confluence can be accessed by using the confluence.py python script. It is accessible directly from the PATH.

The script works with a series of subcommands invoked like this: confluence.py <subcommand>

## Available Commands

* get <url_or_id> : Fetch a page by URL or page ID (most flexible option)
* view <page_id> : View a page by its numeric ID
* search <query> : Search for pages matching a query
* spaces : List available spaces

## Options

* --raw : Show raw HTML content instead of stripped text (useful for get/view commands)
* --limit <n> : Limit number of results for search/spaces commands (default: 25)

## URL Formats Supported

The `get` command supports the following Confluence URL formats:

* `https://wiki.example.com/pages/viewpage.action?pageId=123456`
* `https://wiki.example.com/pages/viewpage.action?spaceKey=SPACE&title=Page+Title`
* `https://wiki.example.com/display/SPACE/Page+Title`

## Examples

* Fetch page by URL:
  confluence.py get "https://wiki.example.com/pages/viewpage.action?spaceKey=SONIC&title=My+Page"

* Fetch page by ID:
  confluence.py get 123456
  confluence.py view 123456

* Search for pages:
  confluence.py search "signal processing"

* List spaces:
  confluence.py spaces

* Get raw HTML content:
  confluence.py get "https://wiki.example.com/display/SPACE/Page" --raw

## Environment Variables

The following environment variables must be set:

* CONFLUENCE_URL : Base URL of the Confluence instance (e.g., https://wiki.example.com)
* CONFLUENCE_TOKEN : Bearer token for authentication

## Notes

* The content is returned with HTML tags stripped by default for readability
* Use --raw to get the original HTML/storage format if you need to preserve formatting
* Page content is in Confluence storage format (similar to XHTML)
