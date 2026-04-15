#!/bin/env bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RDP_FILE="${SCRIPT_DIR}/CH03CWA69S5TB4.rdp"

# Password is not used here, have to login again in RDP. Just pass anything so freerdp does not ask
# Derived from scripts/CH03CWA69S5TB4.rdp
xfreerdp3 /v:CH03CWA69S5TB4  /u:"AzureAD\leonard.bise@sonova.com" /p:tutu /d:sonova.com /sound /log-level:TRACE /sec:nla:off /f /dynamic-resolution /gfx:avc444 /clipboard /drive:home,$HOME /cert:ignore /network:auto

# Trace level: /log-level:TRACE
# /sec:nla:off Disable NLA auth (Required for Sonova)
# /f Full screen
