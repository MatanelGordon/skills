# Terminal driver landscape

What exists for driving a terminal program programmatically, so you can pick one
instead of writing another.

> **Verification status.** `scripts/pty-drive.py` in this skill was **executed on
> this machine** (macOS, Python 3.12) — happy path, unmatched-pattern, timeout,
> bad-usage and `--json` paths all confirmed, exit codes 0/1/2/64 as documented.
> Everything else below was **found by search on 2026-08-22 and not installed or
> run here**. Names, capabilities and even existence can change; re-check before
> depending on one. This landscape moves faster than most.

---

## How to search

Run these before hand-rolling anything. The whole point is to find the thing that
already works.

```bash
# published Agent Skills covering terminal driving
gh search code --filename SKILL.md "tmux" --limit 20
gh search code --filename SKILL.md "pty" --limit 20

# MCP servers
gh search repos "mcp tmux terminal" --limit 20
gh search repos "mcp tui automation" --limit 20
```

Also check whatever MCP registry the host uses — servers are frequently listed
there before they are easy to find on GitHub.

## MCP servers

Preferred when one is available and configured: the agent receives structured
screen state and a real input channel, instead of scraping text out of a shell
pipeline.

| Server | Approach | Notes |
|---|---|---|
| **pilotty** (`msmps/pilotty`) | Daemon-managed PTY sessions, full VT100 emulation | Exposes screen state *including cursor position*, plus keyboard input. Built explicitly for agents driving TUIs — the closest match to this skill's job. |
| **terminal-control-mcp** (`wehnsdaefflae`) | Persistent tmux-backed sessions | Adds a web interface for a human to watch the same session, plus security controls. Good when a person needs to observe what the agent is doing. |
| **tmux-mcp-server** (`lox`), **tmux-mcp** (`jonrad`), **tmux-mcp** (`bnomei`) | Thin MCP wrappers over tmux | Several independent implementations; capabilities overlap heavily. Pick by what your host already supports. |
| **TUI Kit** | tmux isolation plus native terminal backends | Aimed at launching, controlling and monitoring TUI/CLI apps. |
| **smux** | Rust tmux-compatible multiplexer, daemon-backed SDK | Built for agentic and headless automation; native ratatui integration. Interesting if you're already in Rust. |

Because several of these do the same job, **do not evaluate them all**. Check
what the host has configured, use it, and move on. Comparison shopping here costs
more than it saves.

## Published Agent Skills

- **`tmux-tui-testing`** (`fcoury`) — encodes the drive-a-tmux-session workflow:
  isolated sessions, split panes, keystrokes, resize, capture-pane assertions,
  timeouts and cleanup. Closest published skill to this one; worth reading before
  reinventing its edge cases.

Found via `gh search code --filename SKILL.md`. Not installed here.

## CLIs and libraries

| Tool | Language | Strength | Weakness |
|---|---|---|---|
| **tmux** | any | Best general TUI driver. Real terminal, scrollback, live observation, fixed size, survives detach | Not installed by default on macOS or slim containers |
| **`pty-drive.py`** (bundled here) | any | Zero install, real PTY, regex-driven steps, JSON output | Deliberately minimal — no scrollback model, no live viewing |
| **`expect`** | any | Preinstalled almost everywhere; purpose-built for prompt/response | Tcl syntax; awkward for full-screen TUIs |
| **`script`** | any | Records a session's full output including escapes | Records, doesn't drive |
| **node-pty** (`microsoft/node-pty`) | Node | The library behind VS Code's terminal; real PTY, cross-platform incl. Windows ConPTY | Native module via node-gyp; version-sensitive builds |
| **pexpect** | Python | Mature, expressive, well documented | Needs installing; the stdlib `pty` covers most of what a prototype-grade driver needs |
| **portable-pty** | Rust | Cross-platform PTY without node-gyp pain | Rust project required |
| **`screen`** | any | Sometimes present where tmux isn't | Weaker capture story than tmux; prefer a PTY driver instead |

## Framework-native harnesses

When you control the application's source and it is built on one of these, the
framework's own harness beats any external driver — it can drive the app's
internals directly instead of going through a screen.

- **Textual** (Python) — `run_test()` with a `Pilot` object for synthetic keys
  and clicks. Also `textual console` for live event/log streaming from a second
  terminal.
- **Ink** (React/Node) — `ink-testing-library` renders to a string and accepts
  simulated input. This repo has dedicated Ink skills that own the specifics.
- **ratatui** (Rust) — `TestBackend` renders into an inspectable in-memory buffer.
- **bubbletea** (Go) — models are plain functions over messages, so scenarios can
  be driven without a terminal at all.

These are test-shaped by design. Within this skill's exploratory scope, use them
to *observe* — render a state and look at it — rather than to build assertions.

## Choosing, in one line each

- An MCP terminal server is configured → **use it**.
- Full-screen TUI, tmux available → **tmux**.
- Nothing installed, need an answer now → **`pty-drive.py`**.
- Simple prompt/response on a stock machine → **`expect`**.
- Node project, want programmatic control → **node-pty**.
- You own the source and it's Textual/Ink/ratatui/bubbletea → **the framework's harness**.
