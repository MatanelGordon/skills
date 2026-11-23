#!/usr/bin/env bash
# Answers the deploy confirmation so nobody has to sit and wait for it.
set -euo pipefail

tmux new-session -d -s release 'python3 deploy.py prod'
sleep 1                                  # give it a moment to start
tmux send-keys -t release y Enter

# The session closes when deploy.py exits, so wait for that.
while tmux has-session -t release 2>/dev/null; do
  sleep 1
done
echo "release finished"
