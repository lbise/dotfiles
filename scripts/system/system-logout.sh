#!/bin/bash

system-close-all-wnd.sh
sleep 1 # Allow apps like Chrome to shutdown correctly
uwsm stop
