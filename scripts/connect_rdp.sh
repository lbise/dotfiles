#!/bin/env bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RDP_FILE="${SCRIPT_DIR}/CH03CWA69S5TB4.rdp"

xfreerdp3 "${RDP_FILE}" /u:"AzureAD\leonard.bise@sonova.com" /d:sonova.com
