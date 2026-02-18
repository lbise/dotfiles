---
name: sonarr
description: Use the sonarr.py CLI to query and administer Sonarr
---

Sonarr is managed through `sonarr.py`, a CLI for Sonarr's v3 API.

## Sonarr CLI

Run commands as:

`sonarr.py <command> <subcommand> [options]`

In this repo, the script lives at `scripts/sonarr.py`.

## Environment Variables

Set these before running commands:

* `SONARR_API_KEY` (required): API key from Sonarr
* `SONARR_URL` (optional): Base URL, defaults to `http://localhost:8989`

## Global Options

* `--url <url>` : Override Sonarr URL
* `--api-key <key>` : Override API key
* `--timeout <seconds>` : HTTP timeout (default 30)
* `--json` : Output raw JSON instead of table/text output

## Main Command Groups

* `system status` : Show Sonarr version and instance info
* `series list|get|lookup|add|update|delete` : Full series management
* `episode list|get|update` : Episode inspection and updates
* `calendar list` : Calendar entries for date ranges
* `queue list|status|get|remove` : Download queue operations
* `wanted missing|cutoff` : Wanted episode views
* `command list|get|run` : Inspect and trigger Sonarr commands
* `resource list|get|create|update|delete` : Generic CRUD for any resource
* `request <METHOD> <PATH>` : Arbitrary API request escape hatch

## Safety Rules

Mutating commands require explicit confirmation:

* `series update/delete` require `--yes`
* `episode update` requires `--yes`
* `queue remove` requires `--yes`
* `resource update/delete` require `--yes`
* `request` with `PUT/PATCH/DELETE` requires `--yes`

## Common Examples

* Show server status:
  `sonarr.py system status`

* List tracked series:
  `sonarr.py series list`

* Find a show by name:
  `sonarr.py series lookup "Severance"`

* Add a show from lookup result index 0:
  `sonarr.py series add "The Expanse" --select 0 --search-missing`

* Trigger RSS sync:
  `sonarr.py command run RssSync`

* Show queue in JSON:
  `sonarr.py --json queue list --page-size 20`

* Generic request against any endpoint:
  `sonarr.py request GET /system/status`

* Update resource with payload file:
  `sonarr.py resource update qualityprofile 1 --data-file ./profile.json --yes`

## Notes

* Paths passed to `request` can be either `/foo` (auto-prefixed to `/api/v3/foo`) or full `/api/v3/foo`.
* For local usage in this dotfiles repo, invoke with `./scripts/sonarr.py` unless you have `sonarr.py` in your PATH.
