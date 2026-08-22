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

Drive a terminal program by hand to report what actually happened, not what code suggests.

**Scope: exploratory verification.** Launch → interact → capture → report. Not test suites, assertions, or CI.

---

## Search for a tool before building one

Tooling moves fast. **Before writing a driver, look for one** in this order:

1. **MCP terminal server** — strongest option; agent gets structured screen state. Landscape in [references/drivers.md](references/drivers.md).
2. **Published Agent Skill** — `gh search code --filename SKILL.md "tmux"` etc.
3. **CLI or library** — tmux, `expect`, node-pty, framework harness.
4. **Nothing fits** — say so, name closest option and its gap, then hand-roll. Don't silently write bespoke driver.

State which you used. "I used X" and "I looked and nothing fit" are fine; quietly hand-rolling is not.

## The loop

**Launch → interact → capture → report.** All drivers implement these four steps; differ only in setup cost.

The separator between working and flaky: **what happens between steps** — see timing rule.

## Pick a driver

| Driver | Use when | Cost |
|---|---|---|
| **MCP terminal server** | Available. Structured state beats scraping. | Zero once configured |
| **tmux** `send-keys` + `capture-pane` | Full-screen TUIs, long sessions, want to watch live | Needs tmux installed |
| **`scripts/pty-drive.py`** (bundled) | Nothing installed, need answer now | **Zero** — Python stdlib. Unix only |
| **`expect`** | Simple prompt/response, preinstalled on macOS/most Linux | Zero on most systems |
| **node-pty** | Project is Node, want programmatic control | `npm i`, native build |
| **Framework harness** (Textual `Pilot`, `ink-testing-library`) | Control app source, built on that framework | Framework-specific |

**Do not assume tmux exists.** Absent on stock macOS, many containers. Check and fall back:

```bash
command -v tmux >/dev/null && echo tmux || echo "fall back to pty-drive.py"
```

### tmux — best when available

```bash
tmux new-session -d -s probe -x 80 -y 24      # detached, fixed size
tmux send-keys -t probe 'myapp --interactive' Enter
tmux send-keys -t probe 'j' 'j' Enter          # keys, not command line
tmux capture-pane -t probe -p                  # -p prints to stdout
tmux capture-pane -t probe -p -e               # -e keeps ANSI colour
tmux capture-pane -t probe -p -S -200          # include 200 lines scrollback
tmux kill-session -t probe                     # always clean up
```

Explicit size with `-x`/`-y` matters: layout bugs are usually width bugs; random width reproduces inconsistently.

### Zero-install fallback — `scripts/pty-drive.py`

Real PTY via Python stdlib. No tmux, pip, npm. Works wherever Python 3 does.

```bash
./scripts/pty-drive.py --cols 80 --rows 24 \
  --expect 'name: '          --send 'matanel\n' \
  --expect 'env \[dev/prod\]: ' --send 'prod\n' \
  -- bash -c 'printf "name: "; read n; printf "env [dev/prod]: "; read e; echo "DEPLOY $n -> $e"'
```

*Verified on this machine (macOS, Python 3.12) — produced full transcript matching `DEPLOY matanel -> prod`.*

Genuine PTY means programs behave as for humans: colour on, `isatty()` true, prompts appear. That's why piping "hangs" — prompts suppressed off-TTY.

**Platform: macOS, Linux, any Unix.** Needs `os.forkpty`; Windows lacks it. ConPTY needs third-party package — defeats zero-install. On Windows script exits `40` with pointer. Use WSL (runs unchanged), or `node-pty`/`pywinpty` wrapping ConPTY.

Shell recipes assume Unix shell. On Windows, run under WSL or Git Bash.

## The timing rule

**Poll for expected output. Never sleep fixed amount.**

Terminal programs redraw asynchronously; fixed `sleep 0.5` is a guess — too slow on fast machines, too short on loaded ones. Single largest source of flaky driving.

```bash
# wait for screen to contain expected string, with real timeout
for i in $(seq 1 50); do
  tmux capture-pane -t probe -p | grep -q "Ready" && break
  sleep 0.1
done
```

Wait for *specific string/pattern*, not "any output". Spinners emit endlessly while making no progress.

## Reading the screen properly

- **Strip or keep ANSI deliberately.** Colour breaks naive `grep`. Clean text by default; escapes (`-e`) only when colour is the question.
- **Visible pane isn't whole story.** Scrolled-off content gone unless you ask scrollback (`-S -200`). Crash tracebacks scroll away.
- **Width changes behaviour.** Tables, wrapping, truncation are width-dependent. Fix size explicitly; test narrow (60), normal (80), wide (200) if layout is the question.
- **Piped output differs from terminal output.** Programs disable colour, progress bars, prompts when stdout isn't TTY. Driving through pipe tests different code path than user.

## Report what happened

Output is a finding, not a transcript. Give:

1. **What you did** — exact keys/commands, in order.
2. **What you saw** — relevant captured region, trimmed. Not 400 lines.
3. **What it means** — finding, stated plainly.
4. **Reproduction** — driver invocation so others can repeat.

> Sent `j j Enter` on server list. Detail pane showed *first* server's stats, not selected. Screen capture below; reproduced 3/3 at 80x24 and 200x50.

State non-reproduction too: "happened once in five runs" is a different finding from "always broken".

## Anti-patterns

| Anti-pattern | Why it fails |
|---|---|
| Hand-rolling driver without searching first | Tooling unusually good and fast; you rewrote something better. |
| `sleep 2` between steps | Top cause of flaky driving. Poll for expected output instead. |
| Assuming tmux installed | Isn't on stock macOS/many containers. Check and fall back. |
| Driving through pipe not PTY | Programs suppress prompts/colour off-TTY; tested different code path. |
| Waiting for "any output" | Spinners/progress bars emit endlessly while making no progress. |
| Capturing only visible pane | Tracebacks/warnings scroll away. Ask for scrollback. |
| Leaving sessions alive | Hold ports, files, CPU; poison next run. Always kill in cleanup. |
| Not fixing terminal size | Layout bugs are width bugs; random width reproduces inconsistently. |
| Pasting whole transcript as finding | Reader wants conclusion and evidence, not the log. |
| Writing assertions/test suite | Out of scope. Exploratory verification; regression guard separate decision. |
| Reporting "it works" with no evidence | Unfalsifiable. Show captured screen. |
