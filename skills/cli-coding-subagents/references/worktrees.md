# Worktrees and run directories

What `wt.sh` does beyond the commands in `SKILL.md`, and what to do when it
stops.

## Run directory

Prompts, logs and status files need a home that survives a reboot and sits
outside every worktree, so no worker's branch ever carries them. Never use
`/tmp`: macOS purges it, and the log must remain available after a crash.

- **Phased build:** the plan directory.
- **Anything else:** `wt.sh rundir <name>`, run from the project directory. One
  run directory serves a whole run, not one per worker. It prints the path and
  creates `prompts/`, `agents/` and `logs/` in it.
  - In a git repository it is `<worktree-root>/.runs/<name>`: beside the
    worktrees, outside the repository and outside `.plan/`, which `deep-plan`
    owns. A slug cannot start with a dot, so no worktree can take that name.
  - With no git repository it is `.sa-runs/<name>/` in the project.

Never `git add` the run directory. A worker rewriting a tracked status file
leaves the main tree dirty, and `wt.sh merge` then refuses with exit 3.

## No git repository

`wt.sh new` exits 4 when the project is not a git repository, so no worktree is
possible. Do not run `git init` unless the user agrees. Then:

- Dispatch with the project directory as the working directory. Codex also
  needs `--skip-git-repo-check` there.
- Leave the Commit section out of the prompt, and say in it that the worker
  edits the project directly.
- Tell the user the run is not isolated: the worker edits their files directly.
- There is nothing to merge. Verify by running the tests in the project.
- Run workers at the same time only on paths that do not overlap.

## Exit codes and recovery

`0` ok · `1` error (see the message) · `2` merge conflict · `3` merge not
attempted · `4` not a git repository · `64` bad usage.

- **Exit 2** leaves the conflict in the **main working tree**, not the
  worktree, and keeps the worktree. Fix the conflicted files there, run
  `git add` and `git commit`, then rerun `merge`; or `git merge --abort` to
  back out.
- **Exit 3** means nothing was merged: the main tree has uncommitted changes, a
  merge is already in progress, or an untracked file in the main tree would be
  overwritten (`wt.sh` prints which). Commit or stash the changes (ask first if
  they are the user's), finish or abort the merge, or move the untracked file;
  then rerun.
- **Exit 4**: see "No git repository" above.
- **Exit 1** with "git is not installed": install git or put it on `PATH`.

`merge` refuses a worktree with uncommitted changes, because removing it would
destroy them: commit them in the worktree first, or `drop` it on purpose.
