#!/usr/bin/env python3
"""Service dashboard: prints one table sized to the terminal, then exits."""
import shutil

# Width of every column after SERVICE, including the gaps between columns.
OTHER_COLUMNS_WIDTH = 64
# From this width up there is room to show the date of the last deploy too.
WIDE_LAYOUT_MIN_COLUMNS = 160

HEADER = ("SERVICE", "STATUS", "CPU", "MEM", "REGION", "UPTIME", "RST", "OWNER")
SERVICES = (
    ("checkout-api", "running", "12%", "340M", "eu-west-1", "14d 02h", "0", "payments"),
    ("search-indexer", "degraded", "87%", "1.9G", "eu-west-1", "2d 11h", "4", "discovery"),
    ("image-resizer", "running", "33%", "512M", "us-east-2", "31d 07h", "0", "media"),
    ("auth-gateway", "running", "8%", "128M", "eu-west-1", "9d 19h", "1", "identity"),
    ("report-builder", "stopped", "-", "-", "us-east-2", "-", "7", "finance"),
)
LAST_DEPLOYS = ("2026-11-09", "2026-11-21", "2026-10-30", "2026-11-12", "2026-08-02")


def clip(text, width):
    """Shorten text to width characters, marking the cut with '~'."""
    if len(text) <= width:
        return text
    return text[: width - 1] + "~"


def format_row(service_width, cells):
    service, status, cpu, mem, region, uptime, restarts, owner = cells
    return (
        f"{clip(service, service_width).ljust(service_width)}"
        f"  {status:<9}  {cpu:>4}  {mem:>5}  {region:<10}  {uptime:>9}  {restarts:>3}  {owner:<10}"
    )


def main():
    columns = shutil.get_terminal_size(fallback=(80, 24)).columns
    is_wide = columns >= WIDE_LAYOUT_MIN_COLUMNS
    service_width = columns - OTHER_COLUMNS_WIDTH
    print(format_row(service_width, HEADER))
    print("-" * columns)
    for cells, deployed in zip(SERVICES, LAST_DEPLOYS):
        row = format_row(service_width, cells)
        print(f"{deployed}  {row}" if is_wide else row)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
