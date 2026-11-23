"""Acme Notes desktop shell: a pywebview window around the bundled web UI."""
import json
from pathlib import Path

import webview

SETTINGS_FILE = Path.home() / ".acme-notes" / "settings.json"
DEFAULT_SETTINGS = {"theme": "light", "autosave": True}


class Api:
    """Methods the web UI calls through window.pywebview.api."""

    def load_settings(self):
        if not SETTINGS_FILE.exists():
            return dict(DEFAULT_SETTINGS)
        return json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))

    def save_settings(self, settings):
        SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
        SETTINGS_FILE.write_text(json.dumps(settings), encoding="utf-8")
        return {"saved": True}

    def open_settings(self):
        webview.create_window("Settings", "ui/settings.html", js_api=self, width=520, height=640)


def main():
    api = Api()
    webview.create_window("Acme Notes", "ui/index.html", js_api=api, width=1100, height=720)
    webview.start()


if __name__ == "__main__":
    main()
