#!/usr/bin/env bash
# Turns the plain project tree beside this script into a git checkout at the
# directory given as the first argument, replaying the earlier versions of
# src/labels/purge.js from history/ so the file has the commits that explain
# it. The evaluation image runs this once at build time, so both arms start in
# the same repository with the same history.
set -euo pipefail

target="${1:?usage: build.sh <target-dir>}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
purge="src/labels/purge.js"

mkdir -p "$target"
cp -R "$here/project/." "$target/"
cd "$target"

git init -q -b main
git config user.name "Yael Ben-Ami"
git config user.email "yael@shipping.example"

commit_at() {
  GIT_AUTHOR_DATE="$1" GIT_COMMITTER_DATE="$1" git commit -q -F -
}

final_purge="$(cat "$purge")"
final_manifest="$(cat package.json)"
sed 's/"version": "3.2.1"/"version": "3.2.0"/' package.json > package.json.next && mv package.json.next package.json

cp "$here/history/purge.1-first-version.js" "$purge"
git add -A
commit_at "2026-02-10T10:04:00+00:00" <<'MESSAGE'
feat: book shipments with Norvia and keep their labels
MESSAGE

cp "$here/history/purge.2-with-pause.js" "$purge"
git add -A
commit_at "2026-04-22T07:31:00+00:00" <<'MESSAGE'
fix(labels): pause 250 ms between purge calls

Norvia allows four label deletions per second per account and locks the
account for an hour when we go over (their ticket NV-20931). Last night's
purge ran flat out, tripped the lock, and no shipment could be booked until
it lifted. The pause keeps the job under the limit.
MESSAGE

printf '%s\n' "$final_purge" > "$purge"
git add -A
commit_at "2026-06-30T15:48:00+00:00" <<'MESSAGE'
fix(labels): re-read each label before purging it

Norvia re-issues a label under the same id when a shipment is rebooked. The
purge list is built at the start of the run, so by the time we reach a row
the label can belong to a live shipment again. Deleting it then voids that
shipment: INC-482, 31 parcels stranded at the depot. The second read is the
guard against that, not a leftover.
MESSAGE

printf '%s\n' "$final_manifest" > package.json
git add -A
commit_at "2026-09-15T09:00:00+00:00" <<'MESSAGE'
chore: release 3.2.1
MESSAGE
