#!/usr/bin/env bash
#
# ori-precheck.sh — verify the ori CLI can reach OpenRouter before dispatching
# subagent work.
#
# Usage:
#   ori-precheck.sh [--json]
#
# Exit codes (same contract as cli-coding-subagents/scripts/precheck.sh):
#
#   0   OK              — a credential resolves; safe to dispatch
#   10  NOT_LOGGED_IN   — no credential; STOP and ask the user to run `ori login`
#   40  UNAVAILABLE     — ori not on PATH, or python3 missing to parse its output
#
# This script NEVER prints an API key, the contents of credentials.json, or the
# account identifier. It reports only whether auth resolved and which SOURCE it
# came from (kind + file path), because "workspace or global?" is the thing that
# changes what you should do next.
#
# Browser OAuth cannot be performed on the user's behalf. On exit 10 the correct
# action is to tell them to run `ori login` and wait — never attempt it.

set -uo pipefail

JSON=0
for arg in "$@"; do
  case "$arg" in
    --json|--agent) JSON=1 ;;
    -h|--help)
      awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "$0"
      exit 0 ;;
    *) echo "unknown arg: $arg" >&2; exit 64 ;;
  esac
done

emit() { # status code summary source_kind source_location
  if [ "$JSON" -eq 1 ]; then
    python3 -c '
import json, sys
print(json.dumps({
    "status": sys.argv[1],
    "exit_code": int(sys.argv[2]),
    "summary": sys.argv[3],
    "source": ({"kind": sys.argv[4], "location": sys.argv[5]}
               if sys.argv[4] else None),
}, indent=2))' "$1" "$2" "$3" "${4:-}" "${5:-}"
  else
    printf '%s\n' "$3"
    [ -n "${4:-}" ] && printf 'credential source: %s (%s)\n' "$4" "$5"
  fi
}

# ----------------------------------------------------------------- ori present
if ! command -v ori >/dev/null 2>&1; then
  emit UNAVAILABLE 40 \
    "ori not found on PATH. Install it (see https://openrouter.ai), or use the codex/copilot path instead."
  exit 40
fi

# python3 parses ori's JSON. Without it we would have to scrape human text,
# which changes between releases — better to stop than to guess.
if ! command -v python3 >/dev/null 2>&1; then
  emit UNAVAILABLE 40 "python3 not found; cannot parse ori's JSON output safely."
  exit 40
fi

# -------------------------------------------------------------------- ori auth
# `ori auth` exits non-zero when no credential resolves from the current
# directory. Capture stdout only; logs and diagnostics go to stderr under --json.
AUTH_JSON="$(ori auth --json 2>/dev/null)"
AUTH_RC=$?

if [ "$AUTH_RC" -ne 0 ] || [ -z "$AUTH_JSON" ]; then
  emit NOT_LOGGED_IN 10 \
    "No OpenRouter credential resolves here. STOP: ask the user to run \`ori login\` (browser OAuth, or \`ori login --with-key\` non-interactively, or export OPENROUTER_API_KEY). Do not attempt OAuth on their behalf."
  exit 10
fi

# Extract only non-secret fields. userId is deliberately NOT surfaced.
PARSED="$(printf '%s' "$AUTH_JSON" | python3 -c '
import json, sys
try:
    doc = json.load(sys.stdin)
except Exception:
    print("PARSE_ERROR"); raise SystemExit(0)
data = doc.get("data") or {}
src = data.get("source") or {}
print("\t".join([
    "OK" if data.get("authenticated") else "NO",
    str(src.get("kind") or ""),
    str(src.get("location") or ""),
]))
')"

if [ "$PARSED" = "PARSE_ERROR" ]; then
  emit UNAVAILABLE 40 "ori auth --json returned output this script could not parse."
  exit 40
fi

AUTHED="$(printf '%s' "$PARSED" | cut -f1)"
KIND="$(printf '%s' "$PARSED" | cut -f2)"
LOCATION="$(printf '%s' "$PARSED" | cut -f3)"

if [ "$AUTHED" != "OK" ]; then
  emit NOT_LOGGED_IN 10 \
    "ori reports no active OpenRouter credential. STOP: ask the user to run \`ori login\`."
  exit 10
fi

# A workspace credential only applies inside its own directory tree. Subagents
# run in git worktrees elsewhere, so a workspace-scoped credential may not
# resolve there — worth saying out loud before dispatch.
NOTE=""
if [ "$KIND" != "global" ]; then
  NOTE=" NOTE: this is a ${KIND}-scoped credential; confirm it also resolves inside subagent worktrees."
fi

emit OK 0 "ori is authenticated with OpenRouter; safe to dispatch.${NOTE}" "$KIND" "$LOCATION"
exit 0
