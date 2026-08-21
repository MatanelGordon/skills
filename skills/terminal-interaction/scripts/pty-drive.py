#!/usr/bin/env python3
"""
pty-drive.py — drive an interactive terminal program through a real PTY.

Zero install: Python 3 standard library only. No tmux, no pexpect, no npm.
Use when nothing else is available, or when you want the program to behave
exactly as it does for a human (isatty() true, colour on, prompts shown).

Usage:
  pty-drive.py [options] --expect PATTERN --send TEXT [...] -- CMD [ARGS...]

  Each --expect must be followed by a --send. Steps run in order: the driver
  waits for PATTERN (a Python regex, matched against everything received so
  far) and then writes TEXT. "\\n", "\\t", "\\r" and "\\x1b" in TEXT are
  interpreted as the real control characters.

Options:
  --cols N        terminal width  (default 80) — layout bugs are width bugs
  --rows N        terminal height (default 24)
  --timeout SEC   overall wall-clock limit (default 20)
  --idle SEC      quiet period that means "output has settled" (default 0.35)
  --strip-ansi    remove escape sequences from the printed transcript
  --json          emit one JSON document on stdout instead of a transcript
  --quiet         suppress the transcript; exit code carries the result

Exit codes:
  0   every step matched and was sent
  1   a step's pattern never appeared (transcript shows how far it got)
  2   timed out before finishing
  64  bad usage

Why polling and not sleeping: terminal programs redraw asynchronously, so a
fixed sleep is simultaneously too slow on a fast machine and too short on a
loaded one. This waits for the pattern, bounded by --timeout.
"""

import argparse
import json
import os
import pty
import re
import select
import sys
import time

ANSI_RE = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b[@-Z\\-_]|\r")

ESCAPES = {"\\n": "\n", "\\r": "\r", "\\t": "\t", "\\e": "\x1b", "\\x1b": "\x1b"}


def unescape(text):
    """Interpret the small set of escapes a caller can type on a shell line."""
    for token, char in ESCAPES.items():
        text = text.replace(token, char)
    return text


def strip_ansi(text):
    return ANSI_RE.sub("", text)


def parse_args(argv):
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--cols", type=int, default=80)
    parser.add_argument("--rows", type=int, default=24)
    parser.add_argument("--timeout", type=float, default=20.0)
    parser.add_argument("--idle", type=float, default=0.35)
    parser.add_argument("--expect", action="append", default=[])
    parser.add_argument("--send", action="append", default=[])
    parser.add_argument("--strip-ansi", action="store_true")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--quiet", action="store_true")
    parser.add_argument("-h", "--help", action="store_true")

    if "--" not in argv:
        return None, None, "missing '--' before the command to run"
    split = argv.index("--")
    opts = parser.parse_args(argv[:split])
    command = argv[split + 1:]

    if opts.help:
        print(__doc__.strip())
        raise SystemExit(0)
    if not command:
        return None, None, "no command given after '--'"
    if len(opts.expect) != len(opts.send):
        return None, None, (
            f"--expect given {len(opts.expect)} time(s) but --send given "
            f"{len(opts.send)}; they must pair up"
        )
    for pattern in opts.expect:
        try:
            re.compile(pattern)
        except re.error as exc:
            return None, None, f"bad --expect regex {pattern!r}: {exc}"
    return opts, command, None


def drive(command, steps, cols, rows, timeout, idle):
    """Run command under a PTY, walking through (pattern, text) steps in order.

    Returns (transcript, steps_completed, timed_out).
    """
    pid, fd = pty.fork()
    if pid == 0:
        # Child: become the target program with a sane terminal environment.
        os.environ["TERM"] = os.environ.get("TERM") or "xterm-256color"
        os.environ["COLUMNS"] = str(cols)
        os.environ["LINES"] = str(rows)
        try:
            os.execvp(command[0], command)
        except OSError as exc:
            sys.stderr.write(f"pty-drive: cannot exec {command[0]!r}: {exc}\n")
        os._exit(127)

    _set_winsize(fd, rows, cols)

    received = b""
    index = 0
    started = time.time()
    timed_out = False

    while True:
        if time.time() - started > timeout:
            timed_out = True
            break
        readable, _, _ = select.select([fd], [], [], idle)
        if readable:
            try:
                chunk = os.read(fd, 65536)
            except OSError:
                break  # child closed the PTY
            if not chunk:
                break
            received += chunk
            continue
        # Output has gone quiet: either advance a step, or we are done.
        if index >= len(steps):
            break
        pattern, text = steps[index]
        if re.search(pattern, received.decode(errors="replace")):
            os.write(fd, text.encode())
            index += 1
        else:
            break  # quiet, but the expected prompt never arrived

    try:
        os.close(fd)
    except OSError:
        pass
    try:
        os.waitpid(pid, os.WNOHANG)
    except (ChildProcessError, OSError):
        pass

    return received.decode(errors="replace"), index, timed_out


def _set_winsize(fd, rows, cols):
    """Best effort: programs that query the terminal need a real size."""
    try:
        import fcntl
        import struct
        import termios

        fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
    except Exception:
        pass  # environment vars above still cover most programs


def main(argv):
    opts, command, error = parse_args(argv)
    if error:
        sys.stderr.write(f"pty-drive: {error}\n\n{__doc__.strip()}\n")
        return 64

    steps = tuple(zip(opts.expect, [unescape(s) for s in opts.send]))
    transcript, completed, timed_out = drive(
        command, steps, opts.cols, opts.rows, opts.timeout, opts.idle
    )

    shown = strip_ansi(transcript) if opts.strip_ansi else transcript
    if timed_out:
        status, code = "timeout", 2
    elif completed < len(steps):
        status, code = "unmatched", 1
    else:
        status, code = "ok", 0

    if opts.json:
        print(json.dumps({
            "status": status,
            "steps_total": len(steps),
            "steps_completed": completed,
            "unmatched_pattern": steps[completed][0] if code == 1 else None,
            "cols": opts.cols,
            "rows": opts.rows,
            "transcript": strip_ansi(transcript),
        }, indent=2))
        return code

    if not opts.quiet:
        print(shown, end="" if shown.endswith("\n") else "\n")
    if code == 1:
        sys.stderr.write(
            f"pty-drive: step {completed + 1}/{len(steps)} never matched: "
            f"{steps[completed][0]!r}\n"
        )
    elif code == 2:
        sys.stderr.write(
            f"pty-drive: timed out after {opts.timeout}s "
            f"({completed}/{len(steps)} steps done)\n"
        )
    return code


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
