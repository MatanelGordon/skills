---
name: sweat-dreams
description: >
  Keep this machine awake while you are working, using the sweat-dreams tool, so long
  agent runs are not killed by the computer going to sleep. Use at the START of any task
  expected to run more than a couple of minutes — builds, test suites, benchmarks,
  migrations, parallel subagent work, long downloads — and release it when done. Also
  use when a rate limit is hit: hold the machine awake until the quota resets so the
  session can resume. Run `sweat-dreams beat` periodically during long work so the lease
  stays fresh; an idle or dead session releases automatically. Works on macOS
  (caffeinate), Linux (systemd-inhibit), and Windows/WSL (PowerShell); laptops keep the
  display awake by default, desktops let it sleep. The user can always see and stop it
  themselves.
license: MIT
metadata:
  author: Matanel Gordon
  source: https://github.com/MatanelGordon/skills
  requires: caffeinate (macOS), systemd-inhibit or gnome-session-inhibit (Linux), or PowerShell (Windows/WSL). Menu bar indicator is macOS-only. Detects claude/codex/copilot sessions specifically.
---

# sweat-dreams

Keeps the machine awake while an agent is working, and — importantly — **stops**
when it is not. One refcounted keep-awake process for the whole machine, one
lease per agent session.

| OS | Mechanism | Display hold |
|---|---|---|
| macOS | `caffeinate` | `-d` |
| Linux | `systemd-inhibit` (fallback `gnome-session-inhibit`) | idle inhibitor; DE screensavers vary |
| Windows / WSL | PowerShell `SetThreadExecutionState` | `ES_DISPLAY_REQUIRED` |

**Laptops keep the screen awake by default** (battery detected → display hold);
desktops let it sleep. Override per run with `--display` / `--no-display`, or
set `SWEAT_DREAMS_DISPLAY=on|off`.

The CLI ships with this skill at `scripts/sweat-dreams`. Put it on your PATH
once — the repo installer offers to do this, or:

```bash
cp "<this skill's dir>/scripts/sweat-dreams" ~/.local/bin/ && chmod +x ~/.local/bin/sweat-dreams
```

Commands below assume it is on PATH; otherwise call the script by full path.

## The loop you follow

```bash
sweat-dreams on --label "running the integration suite"   # start of long work
sweat-dreams beat                                          # every few minutes while working
sweat-dreams off                                           # when finished
```

**Take a lease before** anything long-running: a full test suite, a build, a
benchmark, parallel subagent dispatch, a large download or migration. Don't bother
for a quick file edit.

**Beat while you work.** Call `sweat-dreams beat` between major steps — it is
cheap, silent, and idempotent. A lease with no heartbeat for 5 minutes is treated
as stale and dropped, so a session that hangs or is killed cannot keep the Mac
awake forever.

**Release when done.** Always `sweat-dreams off` at the end of the task, including
on the failure path. If you forget, the lease dies on its own when the agent
process exits — but don't rely on that.

Long unattended run with no natural beat points? Start the keeper instead; it
beats until your process exits, then releases itself:

```bash
sweat-dreams keep >/dev/null 2>&1 &
```

## Rate limits — hold through the wait

When you hit a usage/rate limit, the machine sleeping during the wait is what
kills the session. Hold it awake until the quota resets, plus a minute:

```bash
sweat-dreams limit --detect                      # codex: reads its own reset time
sweat-dreams limit --text "5-hour limit reached, resets at 3pm"   # parse a message
sweat-dreams limit --until 1787030523            # explicit epoch, or "3:45pm"
sweat-dreams limit --clear                       # cancel the hold
```

`--text` understands both relative ("try again in 4h 30m", "retry after 120
seconds") and absolute ("resets at 3pm", "resets 15:45") phrasings. A hold keeps
the assertion up even with zero leases.

- **claude and codex only.** `limit` refuses for copilot by design.
- Holds are capped at **8 hours** (`SWEAT_DREAMS_MAX_HOLD`). A weekly-quota reset
  days away is refused rather than pinning the Mac awake — tell the user instead
  of overriding it silently.
- **This keeps the Mac awake; it does not resume the session.** You still have to
  wait and retry. The hold only guarantees the machine is still there when you do.

## Checking and stopping

```bash
sweat-dreams status          # human readable: what is holding, which agents, battery
sweat-dreams status --json   # machine readable
sweat-dreams kill            # release everything immediately
```

`status` distinguishes leases sweat-dreams owns from other `caffeinate` processes
on the machine — Claude Code spawns its own short-lived ones, and those are listed
but never touched.

The user can run `kill` at any time, or use the menu bar indicator
(`sweat-dreams menubar install`, or `sweat-dreams menubar plugin` for
SwiftBar/xbar). Never work around a user stopping it.

## What it does and does not do

- Prevents **system and disk idle sleep**. The display follows the laptop rule
  above; `--no-display` saves battery on a laptop when the screen genuinely
  isn't needed.
- On **battery below 30%**, the assertion is released automatically and the user
  is notified. Do not fight this; if a run genuinely needs to continue, tell the
  user to plug in.
- Only **claude, codex and copilot** may take a lease. `--force` exists for manual
  use; do not use it to bypass the guard.

## Rules

- Never leave a lease behind. Pair every `on` with an `off`.
- Never use `--force`, `--display`, or raise `SWEAT_DREAMS_MAX_HOLD` without the
  user asking.
- If `on` reports the battery floor is blocking, say so plainly rather than
  retrying.
- Don't kill foreign `caffeinate` processes; they belong to someone else.
- If the user stops it mid-run, that is a decision — report the consequence, don't
  restart it.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `refusing: not called from claude, codex or copilot` | The guard did its job — you are outside a recognised agent. |
| `HOLDING OFF — battery N% below floor` | Working as designed. Plug in, or accept sleep. |
| Lease vanished mid-run | No `beat` for 5 minutes, or the agent process died. Beat more often, or use `keep`. |
| `menubar: swiftc is BROKEN` | Stale CLT modulemap; `probe` prints the one-line sudo fix, or use the SwiftBar plugin. |
