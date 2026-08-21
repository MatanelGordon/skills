#!/usr/bin/env bash
# SwiftBar/xbar plugin for sweat-dreams. Drop into your plugin folder.
# <xbar.title>sweat-dreams</xbar.title>
# <xbar.desc>Shows when a coding agent is keeping this Mac awake</xbar.desc>
export PATH="$HOME/.local/bin:$PATH"
J="$(sweat-dreams status --json 2>/dev/null)"
holding=$(printf '%s' "$J" | sed -n 's/.*"holding":\([a-z]*\).*/\1/p')
leases=$(printf '%s' "$J" | sed -n 's/.*"leases":\([0-9]*\).*/\1/p')
batt=$(printf '%s' "$J" | sed -n 's/.*"battery":\([0-9]*\).*/\1/p')
blocked=$(printf '%s' "$J" | sed -n 's/.*"battery_blocked":\([a-z]*\).*/\1/p')
if [ "$holding" = "true" ]; then echo "☕︎"; elif [ "$blocked" = "true" ]; then echo "☕︎!"; else echo "○"; fi
echo "---"
if [ "$holding" = "true" ]; then echo "Preventing sleep — ${leases:-0} session(s) | color=orange"
elif [ "$blocked" = "true" ]; then echo "Holding off — battery ${batt}% below floor | color=red"
else echo "Idle — Mac can sleep | color=gray"; fi
sweat-dreams status 2>/dev/null | grep '^    ' | sed 's/^ *//;s/$/ | font=Menlo size=11/'
echo "---"
echo "Stop keeping awake | bash=$HOME/.local/bin/sweat-dreams param1=kill terminal=false refresh=true"
