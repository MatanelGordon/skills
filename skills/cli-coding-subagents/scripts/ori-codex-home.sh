#!/usr/bin/env bash
#
# ori-codex-home.sh — prepare $HOME/.ori-codex as an isolated CODEX_HOME so
# `ori codex` launches Codex CLI against its own home directory instead of the
# interactive one at $HOME/.codex.
#
# Why: ori injects OpenRouter auth into the environment, but Codex still reads
# its config, instructions, rules, and skills from CODEX_HOME. Sharing the
# interactive home risks clobbering session state and leaking the wrong model
# config. This script links only the static assets a subagent needs.
#
# Usage:
#   ./scripts/ori-codex-home.sh          # idempotent; creates or repairs
#
# Exit codes:
#   0   ready
#   1   source directory missing or unexpected error

set -euo pipefail

SOURCE="${HOME}/.codex"
TARGET="${HOME}/.ori-codex"

if [ ! -d "$SOURCE" ]; then
  echo "~/.codex not found — install Codex CLI first" >&2
  exit 1
fi

mkdir -p "$TARGET"

# Static assets: safe to share read-only via symlink.
for item in AGENTS.md rules skills; do
  src="$SOURCE/$item"
  dst="$TARGET/$item"
  if [ ! -e "$src" ]; then continue; fi   # absent locally; nothing to link
  if [ -L "$dst" ] || [ -e "$dst" ]; then
    # Already present — repair if stale, leave if correct.
    if [ "$dst" = "$(readlink "$dst" 2>/dev/null)" ]; then continue; fi
    rm -f "$dst"
  fi
  ln -s "$src" "$dst"
done

echo "ready: CODEX_HOME=$TARGET"
