#!/usr/bin/env bash
#
# gate-check.sh — re-run the CHECK command behind every gate and report which
# claims actually hold.
#
# Usage:
#   gate-check.sh [options] [GATES.md ...]
#
#   With no file arguments, reads ./GATES.md, then ./gates/*.md.
#
# Options:
#   --timeout SEC   per-check wall-clock limit, 1..86400 (default 120)
#   --only PATTERN  run only gates whose claim matches this regex. A malformed
#                   checkbox has no claim to match, so it is still reported
#   --quiet         suppress per-gate output; exit code carries the result
#   --json          one JSON document on stdout
#
# Exit codes:
#   0   every gate ran and passed
#   1   at least one gate FAILED, or a ticked box turned out to be false
#   2   no gates found, or the file has a gate this script refuses to trust
#       (missing/empty CHECK, a second CHECK under one box, a malformed checkbox)
#   40  unavailable — no readable gates file
#   64  bad usage
#
# REFUSES TO GUESS. Every ambiguity in a gates file resolves to exit 2, never to
# a pass. An empty CHECK, a typo'd checkbox, two CHECKs under one claim: each is
# a case where a sloppy parser reports success over work nobody verified, which
# is precisely the failure this tool exists to catch.
#
# READ-ONLY BY DESIGN. Never writes to a gates file, never ticks a box, never
# records evidence. That is what makes it safe to run from several agents in
# parallel worktrees at once — a checker that mutates the file it checks needs
# locking, and locking that is subtly wrong corrupts the one artifact you trust.
#
# Platform: macOS (incl. stock bash 3.2), Linux, any POSIX shell with bash.
# Windows needs WSL or Git Bash. CRLF files are handled. The timeout polls
# rather than using coreutils `timeout`, which macOS does not ship.

set -uo pipefail

TIMEOUT=120
ONLY=""
QUIET=0
JSON=0
FILES=()

while [ $# -gt 0 ]; do
  case "$1" in
    --timeout)
      [ $# -ge 2 ] || { echo "gate-check: --timeout needs a value" >&2; exit 64; }
      TIMEOUT="$2"; shift 2 ;;
    --only)
      [ $# -ge 2 ] || { echo "gate-check: --only needs a value" >&2; exit 64; }
      ONLY="$2"; shift 2 ;;
    --quiet) QUIET=1; shift ;;
    --json)  JSON=1; shift ;;
    -h|--help)
      awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "$0"
      exit 0 ;;
    --) shift; while [ $# -gt 0 ]; do FILES+=("$1"); shift; done ;;
    -*) echo "gate-check: unknown option $1" >&2; exit 64 ;;
    # Positional file arguments are collected wherever they appear, before or
    # after flags. Getting this wrong silently drops a gates file and reports
    # success over an empty set.
    *) FILES+=("$1"); shift ;;
  esac
done

case "$TIMEOUT" in
  ''|*[!0-9]*) echo "gate-check: --timeout must be whole seconds" >&2; exit 64 ;;
esac
if [ "$TIMEOUT" -lt 1 ] || [ "$TIMEOUT" -gt 86400 ]; then
  echo "gate-check: --timeout must be between 1 and 86400 seconds" >&2; exit 64
fi

# `${arr[@]}` on an empty array trips `set -u` on bash 3.2, which stock macOS
# still ships. The +"..." form expands to nothing instead of erroring.
if [ "${#FILES[@]}" -eq 0 ]; then
  [ -f "GATES.md" ] && FILES+=("GATES.md")
  for f in gates/*.md; do [ -f "$f" ] && FILES+=("$f"); done
fi

READABLE=()
for f in ${FILES[@]+"${FILES[@]}"}; do
  if [ -r "$f" ] && [ -f "$f" ]; then READABLE+=("$f")
  else echo "gate-check: cannot read $f" >&2; fi
done
if [ "${#READABLE[@]}" -eq 0 ]; then
  echo "gate-check: no readable gates file (looked for GATES.md, gates/*.md)" >&2
  exit 40
fi

if command -v python3 >/dev/null 2>&1; then HAVE_PY=1; else HAVE_PY=0; fi

json_str() { # any string -> a JSON string literal
  local s
  if [ "$HAVE_PY" -eq 1 ]; then
    s=$(printf '%s' "${1-}" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null)
    if [ -n "$s" ]; then printf '%s' "$s"; return; fi
  fi
  # No python3: escape by hand rather than emit "". A --json run that drops
  # every claim still parses, so whatever consumes it sees a well-formed report
  # of nothing — the same false confidence this tool exists to refuse.
  s=$(printf '%s' "${1-}" \
    | tr '\t' ' ' | tr -d '\000-\010\013\014\016-\037\177' \
    | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' \
    | awk 'BEGIN { ORS = "" } NR > 1 { print "\\n" } { print }')
  printf '"%s"' "$s"
}

# ------------------------------------------------------------ run one command
# stdin is redirected from /dev/null: without it a CHECK that reads stdin (`cat`,
# an interactive prompt) consumes the rest of the gates file being read by the
# enclosing loop, silently deleting every gate below it and passing the run.
run_check() {
  local cmd="$1" limit="$2" out rc pid waited
  out="$(mktemp)"
  # `set -m` gives the check its own process group so the timeout can kill the
  # whole tree. Without it only the `sh` dies: `npm test`, a compiler, a docker
  # run keep going after the gate reports TIMEOUT, and the work the limit was
  # meant to bound carries on invisibly, holding ports and CPU.
  set -m
  sh -c "$cmd" >"$out" 2>&1 </dev/null &
  pid=$!
  set +m
  waited=0
  while kill -0 "$pid" 2>/dev/null; do
    if [ "$waited" -ge "$((limit * 10))" ]; then
      # A negative PID signals the whole process group; the bare pid is the
      # fallback if the group is already gone. Job control prints
      # "Terminated: 15" to stderr when a background job is killed; suppressing
      # it keeps a timeout looking like a reported result.
      { kill -TERM -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
        sleep 0.3
        kill -KILL -"$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null
        wait "$pid"; } 2>/dev/null
      CHECK_OUT="$(tail -c 2000 "$out")"; rm -f "$out"
      CHECK_RC=124
      return 124
    fi
    sleep 0.1
    waited=$((waited + 1))
  done
  wait "$pid" 2>/dev/null
  rc=$?
  CHECK_OUT="$(tail -c 2000 "$out")"; rm -f "$out"
  CHECK_RC="$rc"
  return "$rc"
}

TOTAL=0; PASSED=0; FAILED=0; STALE=0; REFUSED=0
JSON_ROWS=""

say() { [ "$QUIET" -eq 0 ] && [ "$JSON" -eq 0 ] && printf '%s\n' "$1"; return 0; }

row() { # claim ticked status rc file
  JSON_ROWS="${JSON_ROWS}{\"claim\":$(json_str "$1"),\"ticked\":$2,\"status\":\"$3\",\"exit_code\":$4,\"file\":$(json_str "$5"),\"output\":$(json_str "${CHECK_OUT-}")},"
}

refuse() { # claim reason file
  REFUSED=$((REFUSED + 1)); TOTAL=$((TOTAL + 1)); CHECK_OUT="$2"
  say "  REFUSED $1"
  say "            | $2"
  row "$1" "false" "refused" 0 "$3"
}

for file in ${READABLE[@]+"${READABLE[@]}"}; do
  claim=""; ticked="false"; in_fence=0; skipped=0
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"   # CRLF: a trailing \r corrupts every command it reaches

    # Fenced blocks are documentation, not gates. Without this, a format example
    # inside a gates file gets executed.
    case "$line" in
      '```'*|'~~~'*) in_fence=$((1 - in_fence)); continue ;;
    esac
    [ "$in_fence" -eq 1 ] && continue

    if printf '%s' "$line" | grep -qE '^[[:space:]]*[-*][[:space:]]*\[[ xX]\][[:space:]]'; then
      # A previous claim that never got a CHECK is a wish, not a gate.
      if [ -n "$claim" ]; then refuse "$claim" "no CHECK command under this claim" "$file"; fi
      claim=$(printf '%s' "$line" | sed -E 's/^[[:space:]]*[-*][[:space:]]*\[[ xX]\][[:space:]]*//')
      if printf '%s' "$line" | grep -qE '^[[:space:]]*[-*][[:space:]]*\[[xX]\]'; then
        ticked="true"; else ticked="false"; fi
      skipped=0
      if [ -n "$ONLY" ] && ! printf '%s' "$claim" | grep -qE -- "$ONLY"; then
        claim=""; skipped=1
      fi
      continue
    fi

    # A checkbox-looking line that did not match above is malformed (`- []`,
    # `- [y]`). Silently dropping it also drops its CHECK, so the file passes
    # while a real gate has vanished.
    if [ "$in_fence" -eq 0 ] && printf '%s' "$line" | grep -qE '^[[:space:]]*[-*][[:space:]]*\[[^]]*\]'; then
      if [ -n "$claim" ]; then refuse "$claim" "no CHECK command under this claim" "$file"; claim=""; fi
      refuse "$(printf '%s' "$line" | sed -E 's/^[[:space:]]*//')" \
             "malformed checkbox — expected '- [ ] ' or '- [x] '" "$file"
      # Swallow this gate's CHECK too. Reporting it separately as "a CHECK with
      # no claim above it" turns one broken gate into two refusals and points at
      # the wrong line.
      skipped=1
      continue
    fi

    if printf '%s' "$line" | grep -qE '^[[:space:]]+CHECK:'; then
      [ "$skipped" -eq 1 ] && continue
      cmd=$(printf '%s' "$line" | sed -E 's/^[[:space:]]+CHECK:[[:space:]]*//')
      if [ -z "$claim" ]; then
        # Either a second CHECK under one box, or a CHECK with no claim above.
        refuse "CHECK: $cmd" "CHECK with no claim above it, or a second CHECK under one gate" "$file"
        continue
      fi
      if [ -z "$(printf '%s' "$cmd" | tr -d '[:space:]')" ]; then
        refuse "$claim" "CHECK: is empty — an unfilled placeholder is not proof" "$file"
        claim=""; continue
      fi
      TOTAL=$((TOTAL + 1))
      run_check "$cmd" "$TIMEOUT"
      rc="$CHECK_RC"
      if [ "$rc" -eq 0 ]; then
        PASSED=$((PASSED + 1)); status="pass"; label="PASS    "
      elif [ "$rc" -eq 124 ]; then
        FAILED=$((FAILED + 1)); status="timeout"; label="TIMEOUT "
      else
        FAILED=$((FAILED + 1)); status="fail"; label="FAIL    "
      fi
      # A ticked box whose check now fails: a regression, or a box ticked on a
      # promise rather than a run.
      if [ "$ticked" = "true" ] && [ "$rc" -ne 0 ]; then
        STALE=$((STALE + 1)); status="stale_tick"; label="STALE   "
      fi
      say "  ${label}${claim}"
      if [ "$rc" -ne 0 ] && [ -n "${CHECK_OUT:-}" ] && [ "$QUIET" -eq 0 ] && [ "$JSON" -eq 0 ]; then
        printf '%s\n' "$CHECK_OUT" | sed 's/^/            | /' | head -8
      fi
      row "$claim" "$ticked" "$status" "$rc" "$file"
      claim=""
    fi
  done < "$file"
  if [ -n "$claim" ]; then refuse "$claim" "no CHECK command under this claim" "$file"; fi
done

if [ "$JSON" -eq 1 ]; then
  files_json=""
  for f in ${READABLE[@]+"${READABLE[@]}"}; do files_json="${files_json}$(json_str "$f"),"; done
  printf '{\n  "files": [%s],\n  "total": %s,\n  "passed": %s,\n  "failed": %s,\n  "stale_ticks": %s,\n  "refused": %s,\n  "gates": [%s]\n}\n' \
    "${files_json%,}" "$TOTAL" "$PASSED" "$FAILED" "$STALE" "$REFUSED" "${JSON_ROWS%,}"
elif [ "$QUIET" -eq 0 ]; then
  printf '\n%s gate(s): %s passed, %s failed' "$TOTAL" "$PASSED" "$FAILED"
  [ "$STALE" -gt 0 ]   && printf ', %s ticked-but-false' "$STALE"
  [ "$REFUSED" -gt 0 ] && printf ', %s refused' "$REFUSED"
  printf '\n'
fi

if [ "$TOTAL" -eq 0 ]; then
  echo "gate-check: no gates found — an empty gates file is not a pass" >&2
  exit 2
fi
[ "$REFUSED" -gt 0 ] && exit 2
[ "$FAILED" -gt 0 ] && exit 1
exit 0
