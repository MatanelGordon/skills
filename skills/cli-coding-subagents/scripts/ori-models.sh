#!/usr/bin/env bash
#
# ori-models.sh — list OpenRouter models usable as coding subagents, in two
# tiers, at or under a price ceiling.
#
# Usage:
#   ori-models.sh [--max-output-price D] [--min-context N]
#                 [--review-min-context N] [--json] [--all] [--free-only]
#
#   --max-output-price D   ceiling in US dollars per 1M OUTPUT tokens.
#                          Default 0.50. Use 0 for free models only.
#   --min-context N        author/orchestrator floor   (default 1000000)
#   --review-min-context N reviewer floor              (default  200000)
#   --free-only            shorthand for --max-output-price 0
#   --all                  also list what was filtered out, and why
#   --json                 one JSON document on stdout
#
# Exit codes:
#   0   at least one model qualifies for the author tier
#   1   nothing qualifies for the author tier (says so; recommends nothing)
#   10  paid models requested but the wallet cannot cover them
#   40  curl or python3 unavailable, or the API could not be reached
#
# WHY A PRICE CEILING AND NOT JUST FREE. Free models are rate limited hard (20
# req/min, and failed calls count), and at a 1M context floor the free pool is
# routinely a single family — which makes the mandatory cross-model review gate
# a fiction. A few cents per million output tokens buys both a much wider pool
# and far fewer 429s. The default ceiling of $0.50/1M output is set so a full
# subagent run costs cents, not dollars.
#
# WALLET CHECK. When the ceiling is above zero this script asks OpenRouter what
# credit remains and refuses to recommend paid models against an empty wallet.
# It reads the key only to send it as a bearer token and NEVER prints it, logs
# it, or includes it in --json output.
#
# WHY TWO TIERS. Review must come from a different model than authored the work,
# ideally a different family. Authors need context; reviewers read a diff.
#
# HOW "USABLE FOR CODING" IS DECIDED — from API fields, never from the name:
#
#   1. supported_parameters contains "tools"
#      A coding subagent must call tools; without it the model cannot drive an
#      editor or apply a patch however well it writes. This alone rejects
#      google/lyria-* (music models that are free and large-context).
#
#   2. architecture.output_modalities == ["text"]
#      Anything emitting audio/image/video is not producing code.
#
#   3. Price: pricing.completion per 1M tokens must be at or under the ceiling.
#      For --free-only, EVERY pricing field must be "0" — `request`, `image`,
#      `internal_reasoning` and `web_search` can each be non-zero on an
#      otherwise free-looking model.
#
# The set is volatile. This script is the source of truth; never hardcode a
# model list in documentation.

set -uo pipefail

MIN_CONTEXT=1000000
REVIEW_MIN_CONTEXT=200000
MAX_OUTPUT_PRICE=0.50
JSON=0
SHOW_ALL=0

while [ $# -gt 0 ]; do
  case "$1" in
    --min-context) MIN_CONTEXT="${2:-}"; shift 2 ;;
    --review-min-context) REVIEW_MIN_CONTEXT="${2:-}"; shift 2 ;;
    --max-output-price) MAX_OUTPUT_PRICE="${2:-}"; shift 2 ;;
    --free-only) MAX_OUTPUT_PRICE=0; shift ;;
    --json|--agent) JSON=1; shift ;;
    --all) SHOW_ALL=1; shift ;;
    -h|--help)
      awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "$0"
      exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 64 ;;
  esac
done

command -v curl    >/dev/null 2>&1 || { echo "curl not found" >&2; exit 40; }
command -v python3 >/dev/null 2>&1 || { echo "python3 not found" >&2; exit 40; }

MODELS_FILE="$(mktemp)"
BALANCE_FILE="$(mktemp)"
trap 'rm -f "$MODELS_FILE" "$BALANCE_FILE"' EXIT

# Listing models needs no authentication: spends nothing, sends no credential.
curl -fsS --max-time 30 -o "$MODELS_FILE" \
  https://openrouter.ai/api/v1/models 2>/dev/null || {
  echo "could not reach https://openrouter.ai/api/v1/models" >&2
  exit 40
}

# ------------------------------------------------------------- wallet balance
# Only when paid models are actually on the table. The key is read into a shell
# variable, sent as a header, and never echoed. `curl` reads it from an argument
# here; on a shared machine prefer OPENROUTER_API_KEY so it never hits argv.
echo '{}' > "$BALANCE_FILE"
NEEDS_WALLET="$(python3 -c 'import sys; print("1" if float(sys.argv[1]) > 0 else "0")' "$MAX_OUTPUT_PRICE")"

if [ "$NEEDS_WALLET" = "1" ]; then
  OR_KEY="${OPENROUTER_API_KEY:-}"
  if [ -z "$OR_KEY" ]; then
    OR_KEY="$(python3 - <<'PY' 2>/dev/null
import json, os


def find_key(node):
    """Credential files vary in shape; find the first key-like string."""
    if isinstance(node, dict):
        for name, value in node.items():
            if name.lower() in ("key", "apikey", "api_key", "openrouter_api_key"):
                if isinstance(value, str) and value:
                    return value
            found = find_key(value)
            if found:
                return found
    elif isinstance(node, list):
        for item in node:
            found = find_key(item)
            if found:
                return found
    return None


path = os.path.expanduser("~/.ori/credentials.json")
try:
    with open(path, encoding="utf-8") as handle:
        print(find_key(json.load(handle)) or "")
except Exception:
    print("")
PY
)"
  fi

  if [ -n "$OR_KEY" ]; then
    curl -fsS --max-time 20 -H "Authorization: Bearer $OR_KEY" \
      -o "$BALANCE_FILE" https://openrouter.ai/api/v1/key 2>/dev/null || echo '{}' > "$BALANCE_FILE"
  fi
  unset OR_KEY
fi

MODELS_FILE="$MODELS_FILE" \
BALANCE_FILE="$BALANCE_FILE" \
MIN_CONTEXT="$MIN_CONTEXT" \
REVIEW_MIN_CONTEXT="$REVIEW_MIN_CONTEXT" \
MAX_OUTPUT_PRICE="$MAX_OUTPUT_PRICE" \
WANT_JSON="$JSON" \
SHOW_ALL="$SHOW_ALL" \
python3 <<'PY'
import json
import os
import sys

min_ctx = int(os.environ["MIN_CONTEXT"])
review_min_ctx = int(os.environ["REVIEW_MIN_CONTEXT"])
max_out_price = float(os.environ["MAX_OUTPUT_PRICE"])
as_json = os.environ["WANT_JSON"] == "1"
show_all = os.environ["SHOW_ALL"] == "1"
free_only = max_out_price <= 0

try:
    with open(os.environ["MODELS_FILE"], encoding="utf-8") as handle:
        models = json.load(handle)["data"]
except Exception as exc:
    print(f"could not parse the models API response: {exc}", file=sys.stderr)
    raise SystemExit(40)

try:
    with open(os.environ["BALANCE_FILE"], encoding="utf-8") as handle:
        balance = (json.load(handle) or {}).get("data") or {}
except Exception:
    balance = {}

# Preview / stealth / alpha channels work, but can change or vanish without
# notice. Usable, but never the default choice for a long run.
UNSTABLE_MARKERS = ("stealth/", "-preview", "-alpha", "-beta", ":preview", "-exp")
PER_MILLION = 1_000_000


def price_per_million(pricing, field):
    try:
        return float(pricing.get(field, "0")) * PER_MILLION
    except (TypeError, ValueError, AttributeError):
        return None


def wholly_free(pricing):
    """Every priced dimension zero — not just prompt and completion."""
    if not pricing:
        return False
    for value in pricing.values():
        try:
            if float(value) != 0.0:
                return False
        except (TypeError, ValueError):
            return False
    return True


def classify(model):
    """Return (usable, reason_if_not) from API fields only, never the name."""
    pricing = model.get("pricing") or {}
    out_price = price_per_million(pricing, "completion")
    if out_price is None:
        return False, "unparseable price"
    if free_only:
        if not wholly_free(pricing):
            return False, "not free"
    elif out_price > max_out_price:
        return False, f"output ${out_price:.3f}/M over ceiling"

    architecture = model.get("architecture") or {}
    outputs = architecture.get("output_modalities")
    if outputs is not None and list(outputs) != ["text"]:
        joined = "+".join(outputs) if outputs else "?"
        return False, f"outputs {joined}, not text"
    if "tools" not in (model.get("supported_parameters") or []):
        return False, "no tool calling"
    return True, ""


def is_unstable(model_id):
    return any(marker in model_id for marker in UNSTABLE_MARKERS)


usable, rejected = [], []
for model in models:
    ok, reason = classify(model)
    pricing = model.get("pricing") or {}
    entry = {
        "id": model.get("id") or "?",
        "context_length": model.get("context_length") or 0,
        "unstable": is_unstable(model.get("id") or ""),
        "input_per_m": price_per_million(pricing, "prompt"),
        "output_per_m": price_per_million(pricing, "completion"),
    }
    entry["free"] = wholly_free(pricing)
    (usable if ok else rejected).append(entry if ok else {**entry, "reason": reason})

# Free first, then stable, then cheapest, then widest context — so the top row
# is the safest default rather than merely the biggest.
def sort_key(entry):
    return (
        not entry["free"],
        entry["unstable"],
        entry["output_per_m"] if entry["output_per_m"] is not None else 9e9,
        -entry["context_length"],
        entry["id"],
    )


author = sorted([e for e in usable if e["context_length"] >= min_ctx], key=sort_key)
review = sorted([e for e in usable if e["context_length"] >= review_min_ctx], key=sort_key)


def families(entries):
    return {entry["id"].split("/")[0].lstrip("~") for entry in entries}


all_families = families(author) | families(review)
cross_family_possible = len(all_families) > 1

remaining = balance.get("limit_remaining")
is_free_tier = balance.get("is_free_tier")
wallet_known = remaining is not None
wallet_empty = wallet_known and remaining <= 0
paid_blocked = (not free_only) and wallet_empty

if as_json:
    print(json.dumps({
        "checked": len(models),
        "usable": len(usable),
        "max_output_price_per_million": max_out_price,
        "free_only": free_only,
        "wallet": {
            "known": wallet_known,
            "credit_remaining": remaining,
            "is_free_tier": is_free_tier,
            "blocks_paid_models": paid_blocked,
        },
        "author_tier": {"min_context": min_ctx, "models": author},
        "review_tier": {"min_context": review_min_ctx, "models": review},
        "cross_family_review_possible": cross_family_possible,
        "rejected": rejected if show_all else None,
    }, indent=2))
    raise SystemExit(10 if paid_blocked else (0 if author else 1))


def money(value):
    if value is None:
        return "?"
    return "free" if value == 0 else f"${value:.3f}"


def print_table(title, entries, floor):
    ceiling = "free only" if free_only else f"out <= ${max_out_price:.2f}/M"
    print(f"\n{title}  (tool-capable, text-out, context >= {floor:,}, {ceiling})")
    if not entries:
        print("  none")
        return
    print(f"  {'model':<46} {'ctx':>10}  {'in/M':>7} {'out/M':>7}")
    for entry in entries[:20]:
        flag = "  [UNSTABLE]" if entry["unstable"] else ""
        name = entry["id"]
        length = entry["context_length"]
        inp = money(entry["input_per_m"])
        out = money(entry["output_per_m"])
        print(f"  {name:<46} {length:>10,}  {inp:>7} {out:>7}{flag}")
    if len(entries) > 20:
        print(f"  … and {len(entries) - 20} more (use --json for the full list)")


print(f"checked {len(models)} models; {len(usable)} are tool-capable, text-out "
      f"and within the price ceiling")

if wallet_known:
    tier = "free tier" if is_free_tier else "has credit"
    print(f"wallet: ${remaining:.2f} remaining ({tier})")
elif not free_only:
    print("wallet: unknown (no credential readable) - paid models listed but unverified")

print_table("AUTHOR / ORCHESTRATOR", author, min_ctx)
print_table("REVIEWER", review, review_min_ctx)

if show_all:
    print("\nREJECTED (excluding over-ceiling price)")
    for entry in sorted(rejected, key=lambda e: e["id"]):
        if not entry["reason"].startswith("output $") and entry["reason"] != "not free":
            name = entry["id"]
            reason = entry["reason"]
            print(f"  {name:<46} {reason}")

listed = ", ".join(sorted(all_families)) if all_families else "none"
print(f"\nfamilies available: {listed}")
if not cross_family_possible:
    print("WARNING: only one model family qualifies. Cross-family review is NOT")
    print("         available. Raise --max-output-price or lower the review floor.")

if free_only:
    print("\nFree models are rate limited (20 req/min; 50 req/day under $10 of")
    print("credits, 1000/day at or above) and failed calls count against quota.")
else:
    print(f"\nPaid models above are capped at ${max_out_price:.2f} per 1M output")
    print("tokens. They avoid the free tier's 20 req/min ceiling, which is the")
    print("limit that actually breaks concurrent subagents.")

if paid_blocked:
    print("\nWallet has no credit remaining, so the paid models above cannot run.",
          file=sys.stderr)
    print("Add credit, or re-run with --free-only.", file=sys.stderr)
    raise SystemExit(10)

if not author:
    print(f"\nNothing qualifies at the author floor of {min_ctx:,}.", file=sys.stderr)
    print("Raise --max-output-price, or lower --min-context, deliberately.",
          file=sys.stderr)
    raise SystemExit(1)
PY
exit $?
