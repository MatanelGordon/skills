#!/usr/bin/env bash
# adr.sh — navigate decisions recorded in git, cheapest query first.
#
#   adr.sh list                    every ADR tag: id, subject, tags        (refs only)
#   adr.sh tags                    the distinct tag vocabulary in use      (refs only)
#   adr.sh search <term>           tags first, commit trailers only if needed
#   adr.sh show <adr-id>           full body + the commit it marks + diffstat
#   adr.sh why <path>[:<line>]     blame -> commit -> why -> trailers
#   adr.sh constraints             every active Constraint:   (full history sweep)
#   adr.sh rejected                every Rejected: alternative (full history sweep)
#
# Cost note: list/tags/show read refs only and are O(number of ADRs).
# constraints/rejected walk all history — run them once per planning session,
# not once per question.
set -uo pipefail

die() { echo "adr: $1" >&2; exit "${2:-1}"; }
git rev-parse --git-dir >/dev/null 2>&1 || die "not inside a git repository"

PREFIX="${ADR_TAG_PREFIX:-adr-}"

usage() { awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "$0"; }

# ---------------------------------------------------------------- refs only
cmd_list() {
  local n
  n=$(git tag -l "${PREFIX}*" | wc -l | tr -d ' ')
  [ "$n" -eq 0 ] && { echo "adr: no ${PREFIX}* tags in this repo"; return 0; }
  git tag -l "${PREFIX}*" --sort=refname \
    --format='%(refname:short)|%(contents:subject)|%(trailers:key=Tags,valueonly)' \
  | while IFS='|' read -r id subject tags; do
      [ -n "$id" ] || continue            # trailer format emits a trailing newline
      printf '%-12s %-58s %s\n' "$id" "${subject:0:58}" "${tags:+[$tags]}"
    done
}

cmd_tags() {
  git tag -l "${PREFIX}*" --format='%(trailers:key=Tags,valueonly)' \
  | tr ',' '\n' | sed 's/^ *//;s/ *$//' | grep -v '^$' | sort | uniq -c | sort -rn \
  | awk '{printf "  %-20s %s\n", $2, $1}'
}

cmd_show() {
  local id="${1:-}"; [ -n "$id" ] || die "show needs an adr id (see: adr.sh list)" 64
  case "$id" in "${PREFIX}"*) ;; *) id="${PREFIX}${id}" ;; esac
  git rev-parse -q --verify "refs/tags/$id" >/dev/null || die "no such tag: $id"
  echo "=== $id ==="
  git tag -l "$id" --format='%(contents)'
  local sha; sha=$(git rev-list -n1 "$id")
  echo "--- marks commit $(git log -1 --format='%h %s' "$sha")"
  git show --stat --format='' "$sha" | sed '/^$/d;s/^/    /'
}

# --------------------------------------------- targeted: one blame, one show
cmd_why() {
  local arg="${1:-}"; [ -n "$arg" ] || die "why needs <path> or <path>:<line>" 64
  local path="${arg%%:*}" line=""
  case "$arg" in *:*) line="${arg##*:}" ;; esac
  [ -e "$path" ] || git cat-file -e "HEAD:$path" 2>/dev/null || die "no such path: $path"

  local sha
  if [ -n "$line" ]; then
    sha=$(git blame -w -L "$line,$line" --porcelain -- "$path" 2>/dev/null | head -1 | cut -d' ' -f1)
    [ -n "$sha" ] || die "could not blame $path:$line"
    echo "=== $path:$line last changed by ${sha:0:9} ==="
  else
    sha=$(git log -1 --format='%H' -- "$path")
    [ -n "$sha" ] || die "no commits touch $path"
    echo "=== $path last changed by ${sha:0:9} ==="
  fi

  git show -s --format='%s%n%n%b' "$sha" | sed 's/^/  /'
  local refs; refs=$(git show -s --format='%(trailers:key=Refs,valueonly)' "$sha" | tr -d '\n')
  if [ -n "$refs" ]; then
    echo "--- referenced decisions:"
    for r in $(printf '%s' "$refs" | tr ',' ' '); do
      case "$r" in
        "${PREFIX}"*) git rev-parse -q --verify "refs/tags/$r" >/dev/null \
                        && printf '  %-12s %s\n' "$r" "$(git tag -l "$r" --format='%(contents:subject)')" \
                        || echo "  $r (no such tag)" ;;
        *) echo "  $r" ;;
      esac
    done
  fi
}

# ------------------------------------------------ cheap first, history last
cmd_search() {
  local term="${1:-}"; [ -n "$term" ] || die "search needs a term" 64
  local hits=0
  local tagged
  tagged=$(git tag -l "${PREFIX}*" \
            --format='%(refname:short)|%(contents:subject)|%(trailers:key=Tags,valueonly)' \
          | grep -i -- "$term" || true)
  if [ -n "$tagged" ]; then
    echo "=== ADR tags matching '$term' ==="
    printf '%s\n' "$tagged" | while IFS='|' read -r id s t; do
      [ -n "$id" ] || continue
      printf '  %-12s %-56s %s\n' "$id" "${s:0:56}" "${t:+[$t]}"
    done
    hits=1
  fi
  if [ "$hits" = "0" ]; then
    echo "=== no tag match; falling back to commit history ==="
    git log --grep="$term" -i --format='  %h %s' | head -20
    echo "  (nothing above = try: adr.sh why <path>, or git log -S '$term')"
  else
    echo "  (commits too: git log --grep='$term' -i --oneline)"
  fi
}

# ----------------------------------------------------- full history sweeps
sweep() {
  local key="$1" label="$2"
  echo "=== $label (whole history) ==="
  { git log --format="%(trailers:key=$key,valueonly)"
    git tag -l "${PREFIX}*" --format="%(trailers:key=$key,valueonly)"
  } | grep -v '^$' | sort -u | sed 's/^/  - /'
}

case "${1:-}" in
  list)        shift; cmd_list ;;
  tags)        shift; cmd_tags ;;
  show)        shift; cmd_show "$@" ;;
  why)         shift; cmd_why "$@" ;;
  search)      shift; cmd_search "$@" ;;
  constraints) shift; sweep Constraint "active constraints" ;;
  rejected)    shift; sweep Rejected  "already-rejected alternatives" ;;
  -h|--help|help|'') usage ;;
  *) echo "adr: unknown command: $1" >&2; usage >&2; exit 64 ;;
esac
