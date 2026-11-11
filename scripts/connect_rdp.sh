#!/bin/env bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RDP_FILE="${SCRIPT_DIR}/CH03CWA69S5TB4.rdp"

# Password is not used here, have to login again in RDP. Just pass anything so freerdp does not ask
# Derived from scripts/CH03CWA69S5TB4.rdp
SDL_VIDEODRIVER=wayland sdl-freerdp3 /v:CH03CWA69S5TB4  /u:"AzureAD\leonard.bise@sonova.com" /p:tutu /d:sonova.com /sound /log-level:TRACE /sec:tls /f /dynamic-resolution /gfx:avc444 /clipboard /drive:home,$HOME /cert:ignore /network:auto -grab-keyboard /kbd:layout:0x0000100C

# sdl-freerdp3 instead of xfreerdp3: native Wayland window, not XWayland.
#   xfreerdp3's X11 keyboard grab could outlive focus under XWayland, so keys
#   kept going to RDP after switching workspace (-grab-keyboard didn't help).
#   On Wayland the compositor routes keys, a client cannot keep them.
# /kbd:layout:0x0000100C Swiss French. The SDL client can't read the XKB layout
#   on Wayland and falls back to the locale (en_US -> US layout).
# Trace level: /log-level:TRACE
# /sec:tls Force plain TLS security, i.e. no NLA (Required for Sonova).
#   /sec:nla:off is not enough: NLA extended (HYBRID_EX) stays enabled, the
#   server picks it and the dummy password fails with STATUS_LOGON_FAILURE.
# /f Full screen
