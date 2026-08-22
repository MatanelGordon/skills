#!/usr/bin/env bash
# wt.sh — git worktree lifecycle for parallel CLI subagents.
#
# One worktree per subagent, created off the branch you are on, merged back and
# then ALWAYS removed. Worktrees live outside the repo so parallel agents cannot
# see or trip over each other's trees.
#
#   wt.sh new <slug> [base-ref]   create worktree + branch, print its absolute path
#   wt.sh path <slug>             print the worktree path (exit 1 if absent)
#   wt.sh list                    list live subagent worktrees with their state
#   wt.sh merge <slug> [-F FILE]  merge the branch into the CURRENT branch, then clean up
#                                 -F supplies the full merge message
#   wt.sh drop <slug>             discard the worktree and branch without merging
#   wt.sh gc                      remove worktrees whose branch is already merged
#
# Branch naming: sa/<slug>.   Worktree root: <repo-parent>/.wt-<repo-name>/<slug>
# Override the root with PARALLEL_WT_ROOT.
#
# Exit codes: 0 ok · 1 error (see message) · 2 merge conflict, needs resolution
#             · 3 main tree dirty, merge not attempted · 64 bad usage
set -uo pipefail

die() { echo "wt: $1" >&2; exit "${2:-1}"; }

# prints the header comment block, stopping at the first line of code
usage() { awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "$0"; }
case "${1:-}" in
  -h|--help|help|'') usage; exit 0 ;;
  new|path|list|merge|drop|gc) ;;
  *) echo "wt: unknown command: $1" >&2; usage >&2; exit 64 ;;
esac

git rev-parse --git-dir >/dev/null 2>&1 || die "not inside a git repository"
REPO_ROOT="$(git rev-parse --show-toplevel)"
REPO_NAME="$(basename "$REPO_ROOT")"
WT_ROOT="${PARALLEL_WT_ROOT:-$(dirname "$REPO_ROOT")/.wt-$REPO_NAME}"

cmd="${1:-}"; shift || true

slug_check() {
  [ -n "${1:-}" ] || die "missing <slug>"
  case "$1" in
    *[!a-zA-Z0-9._-]*) die "slug must be [a-zA-Z0-9._-]: $1" ;;
    .*) die "slug may not start with a dot: $1" ;;
  esac
}

# True when the branch is fully contained in HEAD.
is_merged() { git merge-base --is-ancestor "refs/heads/$1" HEAD 2>/dev/null; }

case "$cmd" in
  new)
    slug="${1:-}"; slug_check "$slug"
    base="${2:-HEAD}"
    dir="$WT_ROOT/$slug"; branch="sa/$slug"
    [ -e "$dir" ] && die "worktree already exists: $dir (merge or drop it first)"
    git show-ref --verify --quiet "refs/heads/$branch" && die "branch $branch already exists (merge or drop it first)"
    mkdir -p "$WT_ROOT" || die "cannot create $WT_ROOT"
    # git writes "Preparing worktree ..." to stderr; silence both so dispatch
    # loops stay quiet. Only the path goes to stdout.
    git worktree add -b "$branch" "$dir" "$base" >/dev/null 2>&1 \
      || die "worktree add failed for $slug (base: $base)"
    echo "$dir"
    ;;

  path)
    slug="${1:-}"; slug_check "$slug"
    [ -d "$WT_ROOT/$slug" ] || exit 1
    echo "$WT_ROOT/$slug"
    ;;

  list)
    # Includes detached-HEAD worktrees, which a plain branch filter would hide.
    git worktree list --porcelain | awk -v root="$WT_ROOT/" '
      function flush() {
        if (wt != "" && index(wt, root) == 1) {
          n = split(wt, p, "/"); slug = p[n]
          printf "%s\t%s\t%s\n", slug, (br == "" ? "(detached)" : br), wt
        }
        wt = ""; br = ""
      }
      /^worktree /  { flush(); wt = substr($0, 10) }
      /^branch /    { br = substr($0, 8); sub("^refs/heads/", "", br) }
      END           { flush() }
    ' | while IFS="$(printf '\t')" read -r slug br wt; do
      if [ ! -d "$wt" ]; then
        state="MISSING"
      elif [ -n "$(git -C "$wt" status --porcelain 2>/dev/null)" ]; then
        state="UNCOMMITTED"
      else
        state="clean"
      fi
      ahead="$(git rev-list --count "HEAD..refs/heads/$br" 2>/dev/null || echo '?')"
      merged="unmerged"
      is_merged "$br" && merged="merged"
      printf '%-22s %-24s %-12s %s ahead=%s\n' "$slug" "$br" "$state" "$merged" "$ahead"
    done
    ;;

  merge)
    slug="${1:-}"; slug_check "$slug"
    shift || true
    # Optional: -F <file> supplies the full merge message (request, plan, ADRs).
    # Without it, a terse default is used.
    msg_file=""
    if [ "${1:-}" = "-F" ]; then
      msg_file="${2:-}"
      [ -n "$msg_file" ] || die "-F needs a file path"
      [ -r "$msg_file" ] || die "cannot read merge message file: $msg_file"
    fi
    dir="$WT_ROOT/$slug"; branch="sa/$slug"
    git show-ref --verify --quiet "refs/heads/$branch" || die "no such branch: $branch"

    # A merge already in progress must be finished or aborted first, otherwise
    # git fails with a confusing message.
    if [ -e "$(git rev-parse --git-dir)/MERGE_HEAD" ]; then
      die "a merge is already in progress in the main tree; finish it ('git commit') or abort it ('git merge --abort'), then rerun" 3
    fi

    # The worktree must exist and be committed — removal would destroy anything
    # left uncommitted.
    if [ ! -d "$dir" ]; then
      is_merged "$branch" || die "worktree $dir is missing but $branch is unmerged; inspect it manually"
    elif [ -n "$(git -C "$dir" status --porcelain)" ]; then
      die "worktree $slug has uncommitted changes; commit them in $dir first"
    fi

    # Uncommitted changes in the MAIN tree block git merge with an error that
    # looks like a conflict but is not. Catch it here with accurate advice.
    if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
      die "main working tree has uncommitted changes — commit or stash them, then rerun: wt.sh merge $slug" 3
    fi

    if is_merged "$branch"; then
      echo "wt: $branch is already merged; cleaning up"
    elif [ -z "$(git log --oneline "HEAD..$branch" 2>/dev/null)" ]; then
      echo "wt: $branch has no new commits; cleaning up without merging"
    else
      if [ -n "$msg_file" ]; then set -- --no-ff -F "$msg_file" "$branch"
      else set -- --no-ff -m "merge($slug): subagent work" "$branch"; fi
      if ! git merge "$@"; then
        # A failed merge is only a *conflict* if git actually started one. An
        # untracked file in the way aborts before MERGE_HEAD exists, and telling
        # the caller to "git add and commit" would be wrong there.
        if [ -e "$(git rev-parse --git-dir)/MERGE_HEAD" ]; then
          echo "wt: MERGE CONFLICT — resolve it in the MAIN working tree ($REPO_ROOT)," >&2
          echo "wt: not in the worktree. Fix the conflicted files, 'git add' them, 'git commit'," >&2
          echo "wt: then rerun: wt.sh merge $slug   (or 'git merge --abort' to back out)" >&2
          echo "wt: worktree kept at $dir" >&2
          exit 2
        fi
        echo "wt: merge did NOT start — nothing is conflicted and there is no merge to abort." >&2
        echo "wt: usually an untracked file in $REPO_ROOT would be overwritten (see git's message" >&2
        echo "wt: above); move or delete it, then rerun: wt.sh merge $slug" >&2
        echo "wt: worktree kept at $dir" >&2
        exit 3
      fi
    fi

    if [ -d "$dir" ]; then
      git worktree remove --force "$dir" >/dev/null 2>&1
      if [ -d "$dir" ]; then
        die "MERGED but could NOT remove the worktree at $dir — remove it manually (a process may be cd'd into it); branch $branch left intact"
      fi
    fi
    git branch -D "$branch" >/dev/null 2>&1 || echo "wt: warning — could not delete branch $branch" >&2
    git worktree prune
    rmdir "$WT_ROOT" 2>/dev/null
    echo "wt: merged and removed $slug"
    ;;

  drop)
    slug="${1:-}"; slug_check "$slug"
    dir="$WT_ROOT/$slug"
    if [ -d "$dir" ]; then
      git worktree remove --force "$dir" >/dev/null 2>&1
      [ -d "$dir" ] && die "could not remove worktree at $dir — remove it manually"
    fi
    git branch -D "sa/$slug" >/dev/null 2>&1
    git worktree prune
    rmdir "$WT_ROOT" 2>/dev/null
    echo "wt: dropped $slug"
    ;;

  gc)
    [ -d "$WT_ROOT" ] || { git worktree prune; exit 0; }
    gc_failed=0
    for d in "$WT_ROOT"/*; do
      [ -d "$d" ] || continue
      slug="$(basename "$d")"
      git show-ref --verify --quiet "refs/heads/sa/$slug" || continue
      is_merged "sa/$slug" || continue
      # Never force away work that is not in the merged branch.
      if [ -n "$(git -C "$d" status --porcelain 2>/dev/null)" ]; then
        echo "wt: gc SKIPPED $slug — merged but has uncommitted changes in $d" >&2
        gc_failed=1; continue
      fi
      git worktree remove --force "$d" >/dev/null 2>&1
      if [ -d "$d" ]; then
        echo "wt: gc could not remove $d" >&2; gc_failed=1; continue
      fi
      git branch -d "sa/$slug" >/dev/null 2>&1
      echo "wt: gc removed $slug"
    done
    git worktree prune
    rmdir "$WT_ROOT" 2>/dev/null
    # Non-zero when anything was left behind, so "gc && done" cannot lie.
    exit "$gc_failed"
    ;;

  *) usage >&2; exit 64 ;;   # unreachable: validated above
esac
