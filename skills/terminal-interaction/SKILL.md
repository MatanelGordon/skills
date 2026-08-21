---
name: terminal-interaction
description: >
  Drive a terminal program the way a human tester would - launch it, send
  keystrokes, read the screen back, report what happened. Use when asked to
  manually test, try, poke at, or "see what happens" with a CLI, TUI, REPL,
  installer, interactive prompt, wizard, or SSH session; when a terminal program
  hangs, misdraws, or behaves differently under a pipe than in a real terminal;
  and whenever verifying a terminal change by hand rather than by test suite.
  Always searches for an existing tool first - an MCP server, a published skill,
  or a CLI - and says so plainly when nothing fits. Covers the launch, interact,
  capture, report loop, the poll-for-output rule that replaces sleeping, reading
  ANSI and scrollback, and terminal size effects. For exploratory verification,
  not for authoring test suites, assertions, or CI.
license: MIT
metadata:
  author: Matanel Gordon
  source: https://github.com/MatanelGordon/skills
---

# Terminal interaction

Driving a terminal program by hand, so you can say what actually happened
instead of what the code suggests should happen.

**Scope: exploratory verification.** Launch it, interact, capture, report. Not
test suites, not assertions, not CI wiring — if a finding deserves a permanent
regression guard, that is a different job.

---

## Search for a tool before building one

The tooling here moves fast and a lot already exists. **Before writing a driver,
look for one**, in this order:

1. **An MCP server for terminal control** — the strongest option when available,
   because the agent gets structured screen state rather than scraped text.
   Several exist; the landscape and current names are in
   [references/drivers.md](references/drivers.md).
2. **A published Agent Skill** — `gh search code --filename SKILL.md "tmux"` and
   similar. Someone may have already encoded the workflow.
3. **A CLI or library** — tmux, `expect`, node-pty, a framework's own harness.
4. **Nothing fits** — say so plainly, name the closest option and what it can't
   do, and only then hand-roll. Do not silently write a bespoke driver because
   searching felt slow.

State which of these you used. "I used X" and "I looked and nothing fit" are both
fine answers; quietly hand-rolling is not.

## The loop

**Launch → interact → capture → report.** Every driver below implements the same
four steps; they differ only in how much they cost to set up.

The one thing that separates a working driver from a flaky one is what happens
between steps — see the timing rule below.

## Pick a driver

| Driver | Use when | Cost |
|---|---|---|
| **MCP terminal server** | It's available. Structured screen state beats scraping. | Zero, once configured |
| **tmux** `send-keys` + `capture-pane` | Full-screen TUIs, long-lived sessions, anything you also want to watch live | Needs tmux installed |
| **`scripts/pty-drive.py`** (bundled) | Nothing is installed and you need an answer now | **Zero** — Python stdlib only |
| **`expect`** | Simple prompt/response, and it's preinstalled on macOS and most Linux | Zero on most systems |
| **node-pty** | The project is already Node and you want programmatic control | `npm i`, native build |
| **Framework harness** (Textual `Pilot`, `ink-testing-library`) | You control the app's source and it's built on that framework | Framework-specific |

**Do not assume tmux exists.** It is absent from plenty of machines, including
stock macOS. Check first and fall back rather than failing:

```bash
command -v tmux >/dev/null && echo tmux || echo "fall back to pty-drive.py"
```

### tmux — best when it's there

```bash
tmux new-session -d -s probe -x 80 -y 24      # detached, fixed size
tmux send-keys -t probe 'myapp --interactive' Enter
tmux send-keys -t probe 'j' 'j' Enter          # keys, not a command line
tmux capture-pane -t probe -p                  # -p prints to stdout
tmux capture-pane -t probe -p -e               # -e keeps ANSI colour
tmux capture-pane -t probe -p -S -200          # include 200 lines of scrollback
tmux kill-session -t probe                     # always clean up
```

Setting the size explicitly with `-x`/`-y` matters: layout bugs are usually width
bugs, and a session that inherits a random width reproduces inconsistently.

### Zero-install fallback — `scripts/pty-drive.py`

A real PTY via the Python standard library. No tmux, no pip install, no npm.
Works wherever Python 3 does.

```bash
./scripts/pty-drive.py --cols 80 --rows 24 \
  --expect 'name: '          --send 'matanel\n' \
  --expect 'env \[dev/prod\]: ' --send 'prod\n' \
  -- bash -c 'printf "name: "; read n; printf "env [dev/prod]: "; read e; echo "DEPLOY $n -> $e"'
```

*Verified on this machine (macOS, Python 3.12) — the run above produced the full
transcript and matched `DEPLOY matanel -> prod`.*

Because it allocates a genuine PTY, programs behave as they do for a human:
colour stays on, `isatty()` is true, and prompts actually appear. That last point
is the usual reason piping into a program "hangs" — see below.

## The timing rule

**Poll for the output you expect. Never sleep a fixed amount.**

Terminal programs redraw asynchronously; a fixed `sleep 0.5` is a guess that is
simultaneously too slow on a fast machine and too short on a loaded one. This is
the single largest source of flaky terminal driving.

```bash
# wait for the screen to contain what you need, with a real timeout
for i in $(seq 1 50); do
  tmux capture-pane -t probe -p | grep -q "Ready" && break
  sleep 0.1
done
```

Wait for a *specific string or pattern*, not for "some output". A program that
prints a spinner produces output continuously while making no progress at all.

## Reading the screen properly

- **Strip or keep ANSI deliberately.** Colour codes break naive `grep`. Capture
  clean text by default; capture with escapes (`-e`) only when colour *is* the
  question.
- **The visible pane is not the whole story.** Anything scrolled off is gone
  unless you ask for scrollback (`-S -200`). A crash traceback is exactly the
  thing that scrolls away.
- **Width changes behaviour.** Tables, wrapping and truncation are width
  dependent. Fix the size explicitly, and if layout is the question, test at
  narrow (60), normal (80) and wide (200).
- **Piped output differs from terminal output.** Many programs disable colour,
  progress bars and prompts when `stdout` isn't a TTY. If you drive through a
  pipe you are testing a different code path than the user's.

## Report what happened

The output of this work is a finding, not a transcript. Give:

1. **What you did** — the exact keys or commands, in order.
2. **What you saw** — the relevant captured screen region, trimmed. Not 400 lines.
3. **What it means** — the finding, stated plainly.
4. **Reproduction** — the driver invocation, so someone else can repeat it.

> Sent `j j Enter` on the server list. The detail pane showed the *first*
> server's stats, not the selected one. Screen capture below; reproduced 3/3 at
> 80x24 and at 200x50.

State non-reproduction too: "happened once in five runs" is a finding, and a
different one from "always broken".

## Anti-patterns

| Anti-pattern | Why it fails |
|---|---|
| Hand-rolling a driver without searching first | The tooling here is unusually good and moving fast; you rewrote something better than yours. |
| `sleep 2` between steps | The top cause of flaky terminal driving. Poll for expected output instead. |
| Assuming tmux is installed | It isn't, on stock macOS and many containers. Check and fall back. |
| Driving through a pipe instead of a PTY | Programs suppress prompts and colour off-TTY; you tested a different code path. |
| Waiting for "any output" | Spinners and progress bars emit endlessly while making no progress. |
| Capturing only the visible pane | Tracebacks and warnings scroll away. Ask for scrollback. |
| Leaving sessions alive | They hold ports, files and CPU, and poison the next run. Always kill in cleanup. |
| Not fixing terminal size | Layout bugs are width bugs; a random width reproduces inconsistently. |
| Pasting the whole transcript as the finding | The reader wants the conclusion and the evidence for it, not the log. |
| Writing assertions and a test suite | Out of scope. This is exploratory verification; a regression guard is a separate decision. |
| Reporting "it works" with no evidence | Unfalsifiable. Show the captured screen. |
