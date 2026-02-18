#!/bin/env bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RDP_FILE="${SCRIPT_DIR}/CH03CWA69S5TB4.rdp"

# Password is not used here, have to login again in RDP. Just pass anything so freerdp does not ask
xfreerdp3 "${RDP_FILE}" /u:"AzureAD\leonard.bise@sonova.com" /p:tutu /d:sonova.com /sound

# Trace level: /log-level:TRACE
