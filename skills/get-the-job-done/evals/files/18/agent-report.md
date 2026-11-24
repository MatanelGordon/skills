# Report: remove legacy-sync

Status: DONE

- Deleted `scripts/legacy-sync.sh` and its test.
- Removed the `sync:legacy` entry from `package.json`.
- `npm test` passes (212 tests).

Notes:

- `deploy/crontab` still runs `scripts/legacy-sync.sh` every night; that job
  will fail from now on.
- The user's `~/.zshrc` has an alias `lsync` for the script, which will
  dangle.
