"""Application entry point."""
import importlib
from pathlib import Path

from fastapi import FastAPI

APP_DIR = Path(__file__).parent
FEATURES_DIR = APP_DIR / "features"

app = FastAPI()

# Import every module under app/features (tests excluded). Importing a module
# runs its decorators, and a module-level `router` is mounted on the app.
for path in sorted(FEATURES_DIR.rglob("*.py")):
    if path.name.startswith(("test_", "__")):
        continue
    relative = path.relative_to(APP_DIR.parent).with_suffix("")
    module = importlib.import_module(".".join(relative.parts))
    router = getattr(module, "router", None)
    if router is not None:
        app.include_router(router)
