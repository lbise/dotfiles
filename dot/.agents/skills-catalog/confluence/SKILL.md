---
name: confluence
description: Fetch and read content from Confluence wiki pages
---

Confluence is a wiki system used for documentation and knowledge sharing.

## Confluence CLI

Confluence can be accessed by using the [confluence script](./confluence.py).

The script works with a series of subcommands invoked like this:

python3 ./confluence.py <subcommand>

## Available Commands

* get <url_or_id> : Fetch a page by URL or page ID (most flexible option)
* view <page_id> : View a page by its numeric ID
* search <query> : Search for pages matching a query
* spaces : List available spaces
* update <url_or_id> --content <file> : Update an existing page's content
* create <space_key> <title> --content <file> : Create a new page

## Options

* --raw : Show raw HTML content instead of stripped text (useful for get/view commands)
* --limit <n> : Limit number of results for search/spaces commands (default: 25)
* --content <file> : (update/create) Path to file with new body in Confluence storage format (XHTML). Use - to read from stdin.
* --title <new_title> : (update) New title for the page. If omitted, the existing title is preserved.
* --parent <url_or_id> : (create) URL or ID of the parent page. Omit to create at space root.

## URL Formats Supported

The `get` command supports the following Confluence URL formats:

**Cloud formats:**
* `https://yoursite.atlassian.net/wiki/spaces/SPACE/pages/123456/Page+Title`

**On-premises formats:**
* `https://wiki.example.com/pages/viewpage.action?pageId=123456`
* `https://wiki.example.com/pages/viewpage.action?spaceKey=SPACE&title=Page+Title`
* `https://wiki.example.com/display/SPACE/Page+Title`

## Examples

* Fetch page by Cloud URL:
    python3 ./confluence.py get "https://sonova.atlassian.net/wiki/spaces/RNDMUR/pages/344753019/WiFi+avoidance"

* Fetch page by on-premises URL:
    python3 ./confluence.py get "https://wiki.example.com/pages/viewpage.action?spaceKey=SONIC&title=My+Page"

* Fetch page by ID:
    python3 ./confluence.py get 123456
    python3 ./confluence.py view 123456

* Search for pages:
    python3 ./confluence.py search "signal processing"

* List spaces:
    python3 ./confluence.py spaces

* Get raw HTML content:
    python3 ./confluence.py get "https://wiki.example.com/display/SPACE/Page" --raw

* Update a page's content from a file:
    python3 ./confluence.py update 344753019 --content new_body.xhtml

* Update a page's content and title from a file:
    python3 ./confluence.py update 344753019 --content new_body.xhtml --title "New Page Title"

* Update a page's content from stdin:
    echo '<p>Hello world</p>' | python3 ./confluence.py update 344753019 --content -

* Update using a full URL:
    python3 ./confluence.py update "https://sonova.atlassian.net/wiki/spaces/RNDMUR/pages/344753019/WiFi+avoidance" --content body.xhtml

* Create a new page at the space root:
    python3 ./confluence.py create RNDMUR "My New Page" --content body.xhtml

* Create a new page as a child of an existing page:
    python3 ./confluence.py create RNDMUR "My New Page" --content body.xhtml --parent 344686848

* Create a new page as a child using a parent URL:
    python3 ./confluence.py create RNDMUR "My New Page" --content body.xhtml --parent "https://sonova.atlassian.net/wiki/spaces/RNDMUR/pages/344686848/DM+documentation"

* Create a page from stdin:
    echo '<p>Hello world</p>' | python3 ./confluence.py create RNDMUR "My New Page" --content -

## Creating a sibling page

To place a new page as a sibling of an existing page X (same level in the hierarchy),
fetch X's ancestors to find its direct parent, then pass that parent's ID as --parent:

    python3 ./confluence.py get <X_id_or_url>
    # Look at the ancestors list in the output; the last one is the direct parent.
    # Then:
    python3 ./confluence.py create SPACE "New Page" --content body.xhtml --parent <parent_id>

Alternatively, fetch ancestors programmatically:

    python3 - <<'EOF'
    import base64, os, requests
    base_url = os.environ["CONFLUENCE_URL"]
    token = os.environ["CONFLUENCE_TOKEN"]
    email = os.environ.get("CONFLUENCE_EMAIL", "")
    headers = {"Authorization": "Basic " + base64.b64encode(f"{email}:{token}".encode()).decode()}
    data = requests.get(f"{base_url}/rest/api/content/<PAGE_ID>",
                        headers=headers, params={"expand": "ancestors"}).json()
    parent = data["ancestors"][-1]
    print(f"Direct parent: id={parent['id']}  title={parent['title']}")
    EOF

## Environment Variables

The following environment variables must be set:

* **CONFLUENCE_URL**: Base URL of the Confluence instance
  * Cloud: `https://yoursite.atlassian.net/wiki`
  * On-premises: `https://wiki.example.com`

* **CONFLUENCE_TOKEN**: Authentication token
  * Cloud: API token from https://id.atlassian.com/manage-profile/security/api-tokens
  * On-premises: Bearer token

* **CONFLUENCE_EMAIL**: (Required for Cloud only) Your Atlassian account email
  * Cloud: Used with API token for Basic Auth
  * On-premises: Not required (uses Bearer token)

### Authentication Methods

**Confluence Cloud** (atlassian.net):
* Uses Basic Authentication with email + API token
* Requires both `CONFLUENCE_EMAIL` and `CONFLUENCE_TOKEN`
* Example:
  ```bash
  export CONFLUENCE_URL="https://sonova.atlassian.net/wiki"
  export CONFLUENCE_EMAIL="your.email@company.com"
  export CONFLUENCE_TOKEN="your_api_token_here"
  ```

**Confluence On-Premises**:
* Uses Bearer token authentication
* Only requires `CONFLUENCE_TOKEN`
* Example:
  ```bash
  export CONFLUENCE_URL="https://wiki.example.com"
  export CONFLUENCE_TOKEN="your_bearer_token_here"
  ```

## Notes

* The content is returned with HTML tags stripped by default for readability
* Use --raw to get the original HTML/storage format if you need to preserve formatting
* Page content is in Confluence storage format (similar to XHTML)
* The skill supports both Cloud (atlassian.net) and on-premises Confluence installations
* Authentication method is automatically selected based on whether CONFLUENCE_EMAIL is set
