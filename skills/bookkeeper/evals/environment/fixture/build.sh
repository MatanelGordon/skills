#!/usr/bin/env bash
# Turns the plain project tree beside this script into a git checkout at the
# directory given as the first argument. The evaluation image runs it once at
# build time, so both arms start in the same repository with the same history.
set -euo pipefail

target="${1:?usage: build.sh <target-dir>}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "$target"
cp -R "$here/project/." "$target/"
cd "$target"

git init -q -b main
git config user.name "Noa Peretz"
git config user.email "noa@catalog.example"

commit_at() {
  GIT_AUTHOR_DATE="$1" GIT_COMMITTER_DATE="$1" git commit -q -m "$2"
}

git add -A
commit_at "2026-09-02T13:20:00+00:00" "chore: import catalog-sync from the monorepo split"
