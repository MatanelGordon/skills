#!/usr/bin/env bash
# precheck.sh — verify codex / copilot CLI subagents are usable before dispatching work.
#
# Checks, per tool:  binary present -> runtime OK -> logged in -> usage/quota headroom
#
# Usage:
#   precheck.sh [codex|copilot|all] [--json]
#
# Exit code = WORST status across the tools checked. Read the PER-TOOL lines to
# decide what to do with each tool; the exit code alone cannot express
# "codex fine, copilot blocked".
#
#   0   OK — safe to dispatch
#   10  NOT_LOGGED_IN     — user must log in; do NOT dispatch
#   20  NEEDS_APPROVAL    — copilot would bill the PAID OVERAGE budget, or its quota
#                           could not be determined; ASK THE USER before dispatching
#   30  EXHAUSTED         — quota/overage fully spent; do NOT dispatch
#   40  UNAVAILABLE       — binary missing, runtime too old, or python3 absent
#
# This script never spends API tokens: codex usage is read from local session
# files, copilot usage from the GitHub REST API.
set -uo pipefail

TARGET="all"
FORMAT="text"
for arg in "$@"; do
  case "$arg" in
    codex|copilot|all) TARGET="$arg" ;;
    --json) FORMAT="json" ;;
    -h|--help) awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "$0"; exit 0 ;;
    *) echo "unknown arg: $arg" >&2; exit 64 ;;
  esac
done

WORST=0
REPORT_JSON=""   # newline-joined JSON objects (bash 3.2 safe — macOS ships 3.2)

bump() {
  case "$1" in ''|*[!0-9]*) return 0 ;; esac
  [ "$1" -gt "$WORST" ] && WORST="$1"
  return 0
}

emit() { # tool status code detail action
  local tool="$1" status="$2" code="${3:-40}" detail="$4" action="${5:-}"
  case "$code" in ''|*[!0-9]*) code=40 ;; esac
  local row
  row="$(python3 -c '
import json,sys
print(json.dumps({"tool":sys.argv[1],"status":sys.argv[2],"code":int(sys.argv[3]),
                  "detail":sys.argv[4],"action":sys.argv[5]}))' \
    "$tool" "$status" "$code" "$detail" "$action" 2>/dev/null)"
  [ -n "$row" ] && REPORT_JSON="${REPORT_JSON}${row}
"
  if [ "$FORMAT" = "text" ]; then
    printf '%-8s %-14s %s\n' "$tool" "$status" "$detail"
    [ -n "$action" ] && printf '%-8s %-14s -> %s\n' "" "" "$action"
  fi
  bump "$code"
}

# python3 backs every parse below. Without it we cannot read quota at all, and
# guessing would mean spending the user's money blind.
if ! command -v python3 >/dev/null 2>&1; then
  echo "precheck: python3 not found — cannot read quota; refusing to green-light dispatch" >&2
  exit 40
fi

# ---------------------------------------------------------------- copilot node
# Copilot CLI requires Node >= 24; the user's default node is often older.
# Prints nothing — sets COPILOT_NODE_DIR. Searches every common version manager.
resolve_copilot_node() {
  COPILOT_NODE_DIR=""
  local best="" bestmaj=0 cand maj

  if command -v node >/dev/null 2>&1; then
    maj="$(node --version 2>/dev/null | sed 's/^v//;s/\..*//')"
    case "$maj" in ''|*[!0-9]*) maj=0 ;; esac
    if [ "$maj" -ge 24 ]; then COPILOT_NODE_DIR="$(dirname "$(command -v node)")"; return 0; fi
  fi

  for cand in \
    "$HOME"/.nvm/versions/node/v*/bin \
    "$HOME"/.local/share/fnm/node-versions/v*/installation/bin \
    "$HOME"/.volta/tools/image/node/*/bin \
    "$HOME"/.asdf/installs/nodejs/*/bin \
    "$HOME"/.local/share/mise/installs/node/*/bin \
    /opt/homebrew/opt/node@*/bin /usr/local/opt/node@*/bin \
    /opt/homebrew/bin /usr/local/bin
  do
    [ -x "$cand/node" ] || continue
    maj="$("$cand/node" --version 2>/dev/null | sed 's/^v//;s/\..*//')"
    case "$maj" in ''|*[!0-9]*) continue ;; esac
    if [ "$maj" -ge 24 ] && [ "$maj" -gt "$bestmaj" ]; then bestmaj="$maj"; best="$cand"; fi
  done

  [ -n "$best" ] && { COPILOT_NODE_DIR="$best"; return 0; }
  return 1
}

# -------------------------------------------------------------------- codex
check_codex() {
  command -v codex >/dev/null 2>&1 || {
    emit codex UNAVAILABLE 40 "codex not on PATH" "install the Codex CLI"; return; }

  # "Not logged in" contains "logged in", so this MUST be anchored.
  local status
  status="$(codex login status 2>&1)"
  if ! printf '%s' "$status" | grep -qE '^[[:space:]]*Logged in'; then
    emit codex NOT_LOGGED_IN 10 "${status:-no response from codex login status}" \
      "ask the user to run: codex login"
    return
  fi

  # Usage: codex writes rate limits into token_count events in session rollout
  # files. Reading the newest costs nothing (no API call).
  local usage
  usage="$(python3 - <<'PY' 2>/dev/null
import glob, json, os, time
files = sorted(glob.glob(os.path.expanduser("~/.codex/sessions/**/rollout-*.jsonl"), recursive=True),
               key=os.path.getmtime, reverse=True)
for path in files[:40]:
    latest = None
    try:
        with open(path, errors="ignore") as fh:
            for line in fh:
                if '"rate_limits"' in line:
                    latest = line
    except OSError:
        continue
    if not latest:
        continue
    try:
        rl = (json.loads(latest).get("payload") or {}).get("rate_limits") or {}
    except Exception:
        continue
    if not rl:
        continue

    def win(w):
        w = w or {}
        pct = w.get("used_percent")
        return {"pct": pct if isinstance(pct, (int, float)) else None,
                "mins": w.get("window_minutes"),
                "resets_at": w.get("resets_at")}

    credits = rl.get("credits") or {}
    try:
        bal = float(credits.get("balance"))
    except (TypeError, ValueError):
        bal = None
    print(json.dumps({
        "primary": win(rl.get("primary")),
        "secondary": win(rl.get("secondary")),
        "plan": rl.get("plan_type"),
        "reached": rl.get("rate_limit_reached_type"),
        "spend_control": rl.get("spend_control_reached"),
        "unlimited_credits": bool(credits.get("unlimited")),
        "has_credits": bool(credits.get("has_credits")),
        "balance": bal,
        "age_min": int((time.time() - os.path.getmtime(path)) / 60),
    }))
    break
PY
)"

  if [ -z "$usage" ]; then
    emit codex OK 0 "logged in; no local usage history yet (quota unknown)" \
      "dispatch, but watch for rate-limit errors"
    return
  fi

  local verdict
  verdict="$(python3 -c '
import json, sys, time

def human(ts):
    if not ts:
        return ""
    try:
        d = ts - time.time()
    except TypeError:
        return ""
    if d <= 0:
        return ""
    h = int(d // 3600)
    return ", resets in %dd%dh" % (h // 24, h % 24) if h >= 24 else ", resets in %dh" % max(h, 1)

try:
    d = json.loads(sys.argv[1])
except Exception:
    print("20|codex usage could not be parsed|treat quota as unknown; ask the user if unsure")
    sys.exit()

plan = d.get("plan") or "?"
age = d.get("age_min") or 0
stale = " (last reading %dh old)" % (age // 60) if age >= 90 else ""

credit = ""
if d.get("unlimited_credits"):
    credit = ", credits: unlimited"
elif d.get("has_credits") and d.get("balance") is not None:
    credit = ", credit balance: %.0f" % d["balance"]

if d.get("reached"):
    print("30|rate limit reached (%s) on plan %s%s%s|do not dispatch to codex"
          % (d["reached"], plan, credit, stale)); sys.exit()
if d.get("spend_control"):
    print("30|spend control reached on plan %s%s%s|do not dispatch to codex"
          % (plan, credit, stale)); sys.exit()

# Consider BOTH windows — on some plans the weekly limit is the secondary one.
wins = []
for key in ("primary", "secondary"):
    w = d.get(key) or {}
    if w.get("pct") is None:
        continue
    mins = w.get("mins") or 0
    label = ("%dd" % (mins // 1440)) if mins >= 1440 else ("%dh" % (mins // 60) if mins >= 60 else "%dm" % mins)
    wins.append((w["pct"], label, w.get("resets_at")))

if not wins:
    print("0|logged in; usage unknown (plan %s)%s%s|dispatch" % (plan, credit, stale)); sys.exit()

worst = max(wins, key=lambda x: x[0])
desc = ", ".join("%s window %.0f%% used" % (lbl, pct) for pct, lbl, _ in wins)
line = "%s (plan: %s)%s%s" % (desc, plan, credit, stale)

if worst[0] >= 100:
    print("30|%s%s|do not dispatch to codex" % (line, human(worst[2])))
elif worst[0] >= 90:
    print("0|NEAR LIMIT — %s%s|dispatch, but expect to run out" % (line, human(worst[2])))
else:
    print("0|%s|dispatch" % line)
' "$usage" 2>/dev/null)"

  if [ -z "$verdict" ]; then
    emit codex UNKNOWN 20 "codex quota could not be determined" \
      "ask the user before relying on codex"
    return
  fi
  local code detail action rest
  code="${verdict%%|*}"; rest="${verdict#*|}"
  detail="${rest%%|*}"; action="${rest#*|}"
  case "$code" in
    0)  emit codex OK 0 "$detail" "$action" ;;
    20) emit codex UNKNOWN 20 "$detail" "$action" ;;
    *)  emit codex EXHAUSTED 30 "$detail" "$action" ;;
  esac
}

# ------------------------------------------------------------------- copilot
check_copilot() {
  if ! resolve_copilot_node; then
    emit copilot UNAVAILABLE 40 "no Node >= 24 found (Copilot CLI requires it)" \
      "install Node 24+, or tell the user copilot is unavailable"; return
  fi
  export PATH="$COPILOT_NODE_DIR:$PATH"
  command -v copilot >/dev/null 2>&1 || {
    emit copilot UNAVAILABLE 40 "copilot not on PATH" "install the Copilot CLI"; return; }

  # Prefer launching as `<node24> <copilot-js>` so the agent's own shell commands
  # keep the project's default node instead of inheriting v24 from PATH.
  local node_note="launch: $COPILOT_NODE_DIR/node $(command -v copilot)"

  # Login. An ambient GH token is a weaker signal than the CLI's own record, so
  # report which one we matched.
  local logged_in=0 how=""
  if python3 -c '
import json,os,sys
p = os.path.expanduser("~/.copilot/config.json")
try:
    raw = "\n".join(l for l in open(p) if not l.lstrip().startswith("//"))
    sys.exit(0 if json.loads(raw).get("loggedInUsers") else 1)
except Exception:
    sys.exit(1)' 2>/dev/null; then
    logged_in=1; how="copilot login"
  elif [ -n "${COPILOT_GITHUB_TOKEN:-}${GH_TOKEN:-}${GITHUB_TOKEN:-}" ]; then
    logged_in=1; how="env token (unverified — may lack Copilot access)"
  fi
  [ "$logged_in" = "1" ] || {
    emit copilot NOT_LOGGED_IN 10 "no copilot credentials found" \
      "ask the user to run: copilot login"; return; }

  # Quota. The CLI only shows this via interactive /usage, so we use the API.
  # If we cannot read it, FAIL CLOSED (code 20 = ask) — never assume headroom,
  # because being wrong spends the user's money.
  if ! command -v gh >/dev/null 2>&1; then
    emit copilot UNKNOWN 20 "logged in via $how, but quota unreadable (gh CLI not installed); $node_note" \
      "ask the user before dispatching to copilot"; return
  fi
  local snap
  snap="$(gh api /copilot_internal/user 2>/dev/null)"
  if [ -z "$snap" ]; then
    emit copilot UNKNOWN 20 "logged in via $how, but quota unreadable (gh cannot reach /copilot_internal/user); $node_note" \
      "ask the user before dispatching to copilot"; return
  fi

  local verdict
  verdict="$(printf '%s' "$snap" | python3 -c '
import json, sys
try:
    d = json.loads(sys.stdin.read())
except Exception:
    print("20|quota response was not valid JSON|ask the user before dispatching"); sys.exit()

q = (d.get("quota_snapshots") or {}).get("premium_interactions")
plan = d.get("copilot_plan") or "?"
reset = d.get("quota_reset_date") or "?"
if not isinstance(q, dict):
    print("20|quota snapshot missing from the API response (plan %s)|ask the user before dispatching" % plan)
    sys.exit()
if q.get("unlimited"):
    print("0|unlimited on %s (resets %s)|dispatch" % (plan, reset)); sys.exit()

def num(v):
    # bool is a subclass of int in Python — a JSON `true` must NOT pass as a count.
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    return v

ent   = num(q.get("entitlement"))
used  = num(q.get("credits_used"))
pct   = num(q.get("percent_remaining"))
ov    = num(q.get("overage_count")) or 0
ovmax = num(q.get("overage_entitlement")) or 0
ovok  = bool(q.get("overage_permitted"))

base = "plan %s, %s/%s credits used, resets %s" % (
    plan, "?" if used is None else used, "?" if ent is None else ent, reset)

# Decide "entitlement spent" from percent_remaining, falling back to the raw
# credit counts so a missing/odd percent field cannot fake an overage.
if pct is not None:
    spent = pct <= 0
elif ent is not None and used is not None and ent > 0:
    spent = used >= ent
else:
    print("20|quota fields unreadable — %s|ask the user before dispatching" % base); sys.exit()

if not spent:
    left = "%.0f%% of entitlement left" % pct if pct is not None else "entitlement remaining"
    print("0|%s (%s)|dispatch" % (base, left)); sys.exit()
if not ovok:
    print("30|entitlement EXHAUSTED and overage not permitted — %s|do not dispatch to copilot" % base); sys.exit()
if ovmax and ov >= ovmax:
    print("30|entitlement AND overage budget exhausted (%d/%d overage) — %s|do not dispatch to copilot"
          % (ov, ovmax, base)); sys.exit()
print("20|PAID OVERAGE: entitlement spent, now billing overage %d/%s — %s|ASK THE USER before dispatching to copilot"
      % (ov, int(ovmax) if ovmax else "?", base))
' 2>/dev/null)"

  if [ -z "$verdict" ]; then
    emit copilot UNKNOWN 20 "quota could not be parsed; $node_note" \
      "ask the user before dispatching to copilot"; return
  fi
  local code detail action rest
  code="${verdict%%|*}"; rest="${verdict#*|}"
  detail="${rest%%|*}"; action="${rest#*|}"
  case "$code" in
    0)  emit copilot OK 0 "$detail; $node_note" "$action" ;;
    20) emit copilot NEEDS_APPROVAL 20 "$detail; $node_note" "$action" ;;
    *)  emit copilot EXHAUSTED 30 "$detail; $node_note" "$action" ;;
  esac
}

if [ "$TARGET" = "codex" ] || [ "$TARGET" = "all" ]; then check_codex; fi
if [ "$TARGET" = "copilot" ] || [ "$TARGET" = "all" ]; then check_copilot; fi

if [ "$FORMAT" = "json" ]; then
  printf '%s' "$REPORT_JSON" | python3 -c '
import json,sys
rows=[json.loads(l) for l in sys.stdin if l.strip()]
print(json.dumps({"worst_code":max([r["code"] for r in rows], default=0),"tools":rows}, indent=2))'
else
  case "$WORST" in
    0)  echo "-> OK to dispatch." ;;
    10) echo "-> BLOCKED: the user must log in (see above)." ;;
    20) echo "-> ASK THE USER before dispatching to the tool flagged above (paid overage or unknown quota)." ;;
    30) echo "-> BLOCKED: quota exhausted for the tool flagged above." ;;
    40) echo "-> BLOCKED: tool unavailable." ;;
  esac
  [ "$TARGET" = "all" ] && echo "   (exit=$WORST is the WORST status; per-tool lines above are what matter)"
fi
exit "$WORST"
