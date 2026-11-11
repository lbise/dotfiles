#!/bin/env bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RDP_FILE="${SCRIPT_DIR}/CH03CWA69S5TB4.rdp"

# Password is not used here, have to login again in RDP. Just pass anything so freerdp does not ask
# Derived from scripts/CH03CWA69S5TB4.rdp
xfreerdp3 /v:CH03CWA69S5TB4  /u:"AzureAD\leonard.bise@sonova.com" /p:tutu /d:sonova.com /sound /log-level:TRACE /sec:tls /f /dynamic-resolution /gfx:avc444 /clipboard /drive:home,$HOME /cert:ignore /network:auto

# Trace level: /log-level:TRACE
# /sec:tls Force plain TLS security, i.e. no NLA (Required for Sonova).
#   /sec:nla:off is not enough: NLA extended (HYBRID_EX) stays enabled, the
#   server picks it and the dummy password fails with STATUS_LOGON_FAILURE.
# /f Full screen
