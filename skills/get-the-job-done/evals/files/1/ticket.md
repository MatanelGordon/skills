# IMP-212: order import command

Add `orders import <file>` to the CLI.

## Acceptance criteria

1. A well-formed CSV file of orders is imported into the `orders` table.
2. TSV files (`.tsv`) are accepted as well as CSV.
3. A malformed row is rejected with a message that names its row number; the rest of the file still imports.
4. Importing the same file a second time creates no duplicate rows.
5. `docs/import.md` documents the command and its exit codes.
