"""Loads the project settings file that a user uploads on the Settings page."""
import json
from dataclasses import dataclass
from pathlib import Path


@dataclass
class Config:
    name: str
    retries: int


def parse_config(path: Path) -> Config | None:
    if not path.exists():
        return None
    try:
        raw = json.loads(path.read_text())
        return Config(name=raw["name"], retries=int(raw["retries"]))
    except (json.JSONDecodeError, KeyError, ValueError):
        return None


def settings_banner(path: Path) -> str:
    config = parse_config(path)
    if config is None:
        return "No settings file yet. Using defaults."
    return f"Loaded settings for {config.name} ({config.retries} retries)."
