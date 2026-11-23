#!/usr/bin/env python3
"""Print what the agent wrote, so every trial's files can be checked afterwards.

SkillEvaluator runs this inside the trial container after the agent stops
(Tier 3, grading mode default_plus_custom). It prints the small text files the
agent left under /workspace, the staged skills excluded, between marker lines.
The tool keeps this output as verifier/test-stdout.txt in the run folder; the
container and its workspace are discarded. It judges nothing: the skill's
scripts/check-review.mjs is run on the printed files afterwards, the same way
for both arms. Its three metrics only say which files exist.
"""
import json
import os
from pathlib import Path

WORKSPACE = Path(os.environ.get("SKILL_EVAL_WORKSPACE", "/workspace"))
LOGS_DIR = Path(os.environ.get("HARBOR_LOGS_DIR", "/logs"))
VERIFIER_DIR = Path(os.environ.get("HARBOR_VERIFIER_DIR", str(LOGS_DIR / "verifier")))
REWARD_JSON = VERIFIER_DIR / "reward.json"
REWARD_TXT = VERIFIER_DIR / "reward.txt"

SKIPPED_DIRS = {"skills", "node_modules", "__pycache__"}
KEPT_SUFFIXES = {".md", ".svg", ".js", ".mjs", ".ts", ".tsx", ".json", ".txt", ".html", ".py"}
MAX_FILE_BYTES = 128 * 1024
MAX_TOTAL_BYTES = 1024 * 1024
BEGIN = "===== VISUAL-PLAN-EVAL FILE "
END = "===== VISUAL-PLAN-EVAL END ====="


def is_kept(relative):
    """True for a small text file outside hidden folders and the staged skills."""
    parts = relative.parts
    hidden = any(part.startswith(".") and part != ".plan" for part in parts[:-1])
    return not hidden and not SKIPPED_DIRS.intersection(parts[:-1]) and relative.suffix.lower() in KEPT_SUFFIXES


def workspace_files():
    """Relative paths of the files worth keeping, smallest first so the size cap drops the largest."""
    found = []
    for root, _dirs, names in os.walk(WORKSPACE):
        for name in names:
            path = Path(root) / name
            relative = path.relative_to(WORKSPACE)
            if path.is_symlink() or not path.is_file() or not is_kept(relative):
                continue
            size = path.stat().st_size
            if size <= MAX_FILE_BYTES:
                found.append((size, relative))
    return sorted(found)


def print_files(files):
    """Print each file between marker lines; returns the paths printed."""
    printed = []
    total = 0
    for size, relative in files:
        if total + size > MAX_TOTAL_BYTES:
            break
        text = (WORKSPACE / relative).read_text(encoding="utf-8", errors="replace")
        print(f"{BEGIN}{relative.as_posix()} =====")
        print(text, end="" if text.endswith("\n") else "\n")
        print(END)
        printed.append(relative)
        total += size
    return printed


def present(paths, predicate):
    return 1.0 if any(predicate(path) for path in paths) else 0.0


def main():
    try:
        printed = print_files(workspace_files())
        metrics = {
            "review_file_present": present(printed, lambda path: path.name.lower() == "review.md"),
            "plan_file_present": present(printed, lambda path: path.name.lower() == "plan.md"),
            "svg_file_present": present(printed, lambda path: path.suffix.lower() == ".svg"),
        }
        reward = {"overall": 1.0, "custom_metrics": metrics}
    except Exception as error:  # a failed listing must not turn into a failed trial
        print(f"grader.py could not list the workspace: {error}")
        reward = {"overall": 1.0, "custom_metrics": {}}
    VERIFIER_DIR.mkdir(parents=True, exist_ok=True)
    REWARD_JSON.write_text(json.dumps(reward, indent=2), encoding="utf-8")
    REWARD_TXT.write_text(str(reward["overall"]), encoding="utf-8")


if __name__ == "__main__":
    main()
