"""Contact import for the CRM. LegacyContactImporter is what production runs today."""
from dataclasses import dataclass
from typing import Protocol


class ContactImporter(Protocol):
    def import_file(self, path: str) -> int:
        """Import the file at `path` and return how many contacts were stored."""
        ...

    def sample_rows(self) -> list[dict]:
        """The built-in sample rows, shown by the upload preview."""
        ...


class LegacyContactImporter:
    def import_file(self, path: str) -> int:
        from imports.legacy import run_legacy_import
        return run_legacy_import(path)

    def sample_rows(self) -> list[dict]:
        return []


@dataclass
class ImporterSettings:
    dedupe: bool = True
    lowercase_emails: bool = True


class RowCleaner:
    def __init__(self, settings: ImporterSettings):
        self.settings = settings

    def clean(self, row: dict) -> dict:
        email = row["email"].strip()
        return {**row, "email": email.lower() if self.settings.lowercase_emails else email}


class NewContactImporter:
    """Spike of the streaming importer. Ignores `path` for now."""

    SAMPLE = [
        {"name": "Ana", "email": " ANA@example.com"},
        {"name": "Ben", "email": "ben@example.com"},
        {"name": "Ana", "email": "ana@example.com "},
    ]

    def __init__(self):
        self.cleaner = RowCleaner(ImporterSettings())

    def sample_rows(self) -> list[dict]:
        return self.SAMPLE

    def import_file(self, path: str) -> int:
        rows = [self.cleaner.clean(row) for row in self.SAMPLE]
        unique = {row["email"]: row for row in rows}
        return len(unique)
