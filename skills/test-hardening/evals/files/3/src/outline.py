"""Outline parser: the headings of a Markdown document."""

BYTE_ORDER_MARK = "﻿"
MAX_LEVEL = 6


def parse_outline(text):
    """Return [(level, title), ...] for every heading in text, in order."""
    lines = text.splitlines()
    if lines[0].startswith(BYTE_ORDER_MARK):
        lines[0] = lines[0][len(BYTE_ORDER_MARK):]
    outline = []
    for line in lines:
        if not line.startswith("#"):
            continue
        level = len(line) - len(line.lstrip("#"))
        title = line[level:].strip()
        if level <= MAX_LEVEL and title:
            outline.append((level, title))
    return outline
