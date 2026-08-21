#!/usr/bin/env bash
#
# ori-free-models.sh — list free OpenRouter models that are actually usable as
# coding subagents, in two tiers.
#
# Usage:
#   ori-free-models.sh [--min-context N] [--review-min-context N] [--json] [--all]
#
#   --min-context N          author/orchestrator floor   (default 1000000)
#   --review-min-context N   reviewer floor              (default  200000)
#   --all                    also list what was filtered out, and why
#   --json                   one JSON document on stdout
#
# Exit codes:
#   0   at least one model qualifies for the author tier
#   1   nothing qualifies for the author tier (says so; recommends nothing)
#   40  curl or python3 unavailable, or the API could not be reached
#
# WHY TWO TIERS. Review must come from a different model than authored the work,
# ideally a different family. At a 1M floor the free pool is routinely a single
# family, which makes "independent review" a fiction. A lower reviewer floor
# keeps cross-family review genuinely possible, since a reviewer reads a diff
# rather than carrying the whole task context.
#
# HOW "USABLE FOR CODING" IS DECIDED — from API fields, never from the name:
#
#   1. supported_parameters contains "tools"
#      The strongest signal. A coding subagent must call tools; a model without
#      tool support cannot drive an editor, run a command, or apply a patch, no
#      matter how good its prose is. This alone rejects google/lyria-* (music
#      models that happen to be free and large-context).
#
#   2. architecture.output_modalities == ["text"]
#      Anything emitting audio/image/video is not producing code. Secondary to
#      (1) because a model can be text-only and still lack tool calling.
#
#   3. Every pricing field is "0"
#      Not just prompt/completion — `request`, `image`, `internal_reasoning` and
#      `web_search` can each be non-zero on an otherwise "free-looking" model.
#
# The free set is small, volatile, and rate limited. This script is the source
# of truth; never hardcode a model list in documentation.
#
# Listing models needs no authentication: this spends nothing and sends no
# credential anywhere.

set -uo pipefail

MIN_CONTEXT=1000000
REVIEW_MIN_CONTEXT=200000
JSON=0
SHOW_ALL=0

while [ $# -gt 0 ]; do
  case "$1" in
    --min-context) MIN_CONTEXT="${2:-}"; shift 2 ;;
    --review-min-context) REVIEW_MIN_CONTEXT="${2:-}"; shift 2 ;;
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
trap 'rm -f "$MODELS_FILE"' EXIT

curl -fsS --max-time 30 -o "$MODELS_FILE" \
  https://openrouter.ai/api/v1/models 2>/dev/null || {
  echo "could not reach https://openrouter.ai/api/v1/models" >&2
  exit 40
}

MODELS_FILE="$MODELS_FILE" \
MIN_CONTEXT="$MIN_CONTEXT" \
REVIEW_MIN_CONTEXT="$REVIEW_MIN_CONTEXT" \
WANT_JSON="$JSON" \
SHOW_ALL="$SHOW_ALL" \
python3 <<'PY'
import json
import os
import sys

min_ctx = int(os.environ["MIN_CONTEXT"])
review_min_ctx = int(os.environ["REVIEW_MIN_CONTEXT"])
as_json = os.environ["WANT_JSON"] == "1"
show_all = os.environ["SHOW_ALL"] == "1"

try:
    with open(os.environ["MODELS_FILE"], encoding="utf-8") as handle:
        models = json.load(handle)["data"]
except Exception as exc:
    print(f"could not parse the models API response: {exc}", file=sys.stderr)
    raise SystemExit(40)

# Preview / stealth / alpha channels work, but can change or vanish without
# notice. Usable, but never the default choice for a long run.
UNSTABLE_MARKERS = ("stealth/", "-preview", "-alpha", "-beta", ":preview", "-exp")


def is_free(pricing):
    """Every priced dimension must be zero, not just prompt and completion."""
    if not pricing:
        return False
    for value in pricing.values():
        try:
            if float(value) != 0.0:
                return False
        except (TypeError, ValueError):
            return False  # unparseable price: assume it costs something
    return True


def classify(model):
    """Return (usable, reason_if_not) from API fields only, never the name."""
    if not is_free(model.get("pricing")):
        return False, "not free"
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
    entry = {
        "id": model.get("id") or "?",
        "context_length": model.get("context_length") or 0,
        "unstable": is_unstable(model.get("id") or ""),
        "modality": (model.get("architecture") or {}).get("modality"),
    }
    if ok:
        usable.append(entry)
    else:
        rejected.append({**entry, "reason": reason})

# Stable first, then widest context, then name — the top row is the default pick.
def sort_key(entry):
    return (entry["unstable"], -entry["context_length"], entry["id"])


author = sorted([e for e in usable if e["context_length"] >= min_ctx], key=sort_key)
review = sorted([e for e in usable if e["context_length"] >= review_min_ctx], key=sort_key)


def families(entries):
    return {entry["id"].split("/")[0] for entry in entries}


all_families = families(author) | families(review)
cross_family_possible = len(all_families) > 1

if as_json:
    print(json.dumps({
        "checked": len(models),
        "free_and_usable": len(usable),
        "author_tier": {"min_context": min_ctx, "models": author},
        "review_tier": {"min_context": review_min_ctx, "models": review},
        "cross_family_review_possible": cross_family_possible,
        "rejected": rejected if show_all else None,
    }, indent=2))
    raise SystemExit(0 if author else 1)


def print_table(title, entries, floor):
    print(f"\n{title}  (free, tool-capable, text-out, context >= {floor:,})")
    if not entries:
        print("  none")
        return
    for entry in entries:
        flag = "  [UNSTABLE - may change or vanish]" if entry["unstable"] else ""
        name = entry["id"]
        length = entry["context_length"]
        print(f"  {name:<46} {length:>9,}{flag}")


print(f"checked {len(models)} models; {len(usable)} are free, tool-capable and text-out")
print_table("AUTHOR / ORCHESTRATOR", author, min_ctx)
print_table("REVIEWER", review, review_min_ctx)

if show_all:
    print("\nREJECTED (free but unusable for coding)")
    for entry in sorted(rejected, key=lambda e: e["id"]):
        if entry["reason"] != "not free":
            name = entry["id"]
            reason = entry["reason"]
            print(f"  {name:<46} {reason}")

listed = ", ".join(sorted(all_families)) if all_families else "none"
print(f"\nfamilies available: {listed}")
if not cross_family_possible:
    print("WARNING: only one model family qualifies. Cross-family review is NOT")
    print("         available today. Either accept same-family review and label")
    print("         it as weaker, or use a paid model for the review pass.")

print("\nFree models are rate limited (20 req/min; 50 req/day under $10 of")
print("credits, 1000/day at or above) and failed calls count against the quota.")
print("Re-run this script rather than trusting any list written down elsewhere.")

if not author:
    print(f"\nNothing free qualifies at the author floor of {min_ctx:,}.", file=sys.stderr)
    print("Not recommending a paid model implicitly - decide that deliberately.",
          file=sys.stderr)
    raise SystemExit(1)
PY
exit $?
