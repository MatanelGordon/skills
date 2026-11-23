#!/usr/bin/env python3
"""Deploy-target menu: j/k move, Enter selects, q quits."""
import os
import select
import sys
import termios
import tty

ITEMS = ("dev", "qa", "staging", "prod")
CLEAR_SCREEN = "\x1b[2J\x1b[H"
FOOTER = "j/k move  Enter select  q quit"
IDLE_TIMEOUT_SECONDS = 20


def draw(cursor):
    rows = ["== Deploy target ==", ""]
    rows += [f" {'>' if index == cursor else ' '} {item}" for index, item in enumerate(ITEMS)]
    rows += ["", FOOTER]
    sys.stdout.write(CLEAR_SCREEN + "\r\n".join(rows) + "\r\n")
    sys.stdout.flush()


def read_key(fd):
    """Return one key, or 'q' when nothing is pressed for IDLE_TIMEOUT_SECONDS."""
    ready, _, _ = select.select([fd], [], [], IDLE_TIMEOUT_SECONDS)
    key = os.read(fd, 1).decode(errors="replace") if ready else ""
    return key or "q"


def next_cursor(cursor, key):
    if key == "j":
        return min(cursor + 1, len(ITEMS) - 1)
    if key == "k":
        return max(cursor - 1, 0)
    return cursor


def choose(fd):
    """Return the chosen index, or None when the user quits."""
    cursor = 0
    while True:
        draw(cursor)
        key = read_key(fd)
        if key in ("\r", "\n"):
            return cursor
        if key == "q":
            return None
        cursor = next_cursor(cursor, key)


def main():
    if not sys.stdin.isatty():
        sys.exit("menu: needs a terminal")
    fd = sys.stdin.fileno()
    saved = termios.tcgetattr(fd)
    try:
        tty.setraw(fd)  # also drops keys typed before the menu is up
        chosen = choose(fd)
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, saved)
    if chosen is None:
        print("Quit.")
        return 1
    print(f"Selected: {ITEMS[chosen]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
