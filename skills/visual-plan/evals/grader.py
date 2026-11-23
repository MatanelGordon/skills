#!/usr/bin/env python3
"""Keep what the agent wrote, so every trial's files can be read and checked.

SkillEvaluator runs this inside the trial container after the agent stops
(Tier 3, grading mode default_plus_custom). It copies the small text files the
agent left under /workspace, the staged skills excluded, into
/logs/artifacts/workspace/, which the tool collects into the run folder. It
judges nothing: scripts/check-review.mjs is run on those copies afterwards,
the same way for both arms. Its three metrics only say which files exist.
"""
import json
import os
import shutil
from pathlib import Path

WORKSPACE = Path(os.environ.get("SKILL_EVAL_WORKSPACE", "/workspace"))
LOGS_DIR = Path(os.environ.get("HARBOR_LOGS_DIR", "/logs"))
VERIFIER_DIR = Path(os.environ.get("HARBOR_VERIFIER_DIR", str(LOGS_DIR / "verifier")))
REWARD_JSON = Path(os.environ.get("HARBOR_REWARD_JSON", str(VERIFIER_DIR / "reward.json")))
REWARD_TXT = Path(os.environ.get("HARBOR_REWARD_TXT", str(VERIFIER_DIR / "reward.txt")))
EXPORT_DIR = LOGS_DIR / "artifacts" / "workspace"

SKIPPED_DIRS = {"skills", "node_modules", "__pycache__"}
KEPT_SUFFIXES = {".md", ".svg", ".js", ".mjs", ".ts", ".tsx", ".json", ".txt", ".html", ".py"}
MAX_FILE_BYTES = 256 * 1024
MAX_TOTAL_BYTES = 4 * 1024 * 1024


def is_kept(relative):
    """True for a small text file outside hidden folders and the staged skills."""
    parts = relative.parts
    hidden = any(part.startswith(".") and part != ".plan" for part in parts[:-1])
    return not hidden and not SKIPPED_DIRS.intersection(parts[:-1]) and relative.suffix.lower() in KEPT_SUFFIXES


def workspace_files():
    """Relative paths of the files worth keeping, smallest first so a size cap drops the least."""
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


def export(files):
    """Copy the files into the artifacts folder; returns the paths copied."""
    copied = []
    total = 0
    for size, relative in files:
        if total + size > MAX_TOTAL_BYTES:
            break
        target = EXPORT_DIR / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(WORKSPACE / relative, target)
        copied.append(relative)
        total += size
    return copied


def present(copied, predicate):
    return 1.0 if any(predicate(path) for path in copied) else 0.0


def main():
    try:
        copied = export(workspace_files())
        metrics = {
            "review_file_present": present(copied, lambda path: path.name.lower() == "review.md"),
            "plan_file_present": present(copied, lambda path: path.name.lower() == "plan.md"),
            "svg_file_present": present(copied, lambda path: path.suffix.lower() == ".svg"),
        }
        details = {"exported_files": {"score": 1.0, "reason": ", ".join(str(path) for path in copied) or "none"}}
        reward = {"overall": 1.0, "custom_metrics": metrics, "details": details}
    except Exception as error:  # a failed copy must not turn into a failed trial
        reward = {"overall": 1.0, "custom_metrics": {}, "details": {"export_error": {"score": 0.0, "reason": str(error)}}}
    VERIFIER_DIR.mkdir(parents=True, exist_ok=True)
    REWARD_JSON.write_text(json.dumps(reward, indent=2), encoding="utf-8")
    REWARD_TXT.write_text(str(reward["overall"]), encoding="utf-8")


if __name__ == "__main__":
    main()
