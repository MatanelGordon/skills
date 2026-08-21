#!/usr/bin/env python3
"""Print the codex session id for a given worktree, for `codex exec resume`.

Codex has no flag to pre-set a session id, but the first line of every rollout is
a `session_meta` record carrying both `session_id` and `cwd`. Matching on cwd is
parallel-safe; picking the newest file is not, because concurrent agents race.

    SID=$(codex-session.py /path/to/worktree)
    cd "$WT" && codex exec resume "$SID" ... "follow-up prompt"

Exits 1 with no output if no session matches that directory.
"""
import glob
import json
import os
import sys


def session_for(worktree: str) -> str | None:
    want = os.path.realpath(worktree)
    newest_mtime, session = 0.0, None
    pattern = os.path.expanduser("~/.codex/sessions/**/rollout-*.jsonl")
    for path in glob.glob(pattern, recursive=True):
        try:
            with open(path, errors="ignore") as fh:
                head = fh.readline()
            payload = json.loads(head).get("payload") or {}
        except (OSError, ValueError):
            continue
        cwd = payload.get("cwd")
        if not cwd or os.path.realpath(cwd) != want:
            continue
        try:
            mtime = os.path.getmtime(path)
        except OSError:
            continue
        if mtime > newest_mtime:
            newest_mtime, session = mtime, payload.get("session_id")
    return session


def main() -> int:
    if len(sys.argv) != 2:
        print(f"usage: {os.path.basename(sys.argv[0])} <worktree-path>", file=sys.stderr)
        return 64
    sid = session_for(sys.argv[1])
    if not sid:
        print(f"no codex session found with cwd={sys.argv[1]}", file=sys.stderr)
        return 1
    print(sid)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
