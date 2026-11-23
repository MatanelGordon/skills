"""Three of the twelve places that create an importer. The other nine look the same."""
import os

from imports.importer import LegacyContactImporter, NewContactImporter


def nightly_import(path: str) -> int:
    importer = NewContactImporter() if os.environ.get("NEW_IMPORTER") == "1" else LegacyContactImporter()
    return importer.import_file(path)


def manual_upload(path: str) -> int:
    importer = NewContactImporter() if os.environ.get("NEW_IMPORTER") == "1" else LegacyContactImporter()
    return importer.import_file(path)


def upload_preview() -> list[dict]:
    importer = NewContactImporter() if os.environ.get("NEW_IMPORTER") == "1" else LegacyContactImporter()
    return importer.sample_rows()[:2]
