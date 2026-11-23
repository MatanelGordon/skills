# Memory index

> How retrieval works (PageIndex): read this file first, pick the row whose
> description and tags best match the question, then open that path. A
> `<folder>/index.md` row is a sub-index: open it, then open the one entry it
> lists. No similarity search is involved.

| Path | What it holds | Tags |
|---|---|---|
| ci.md | Where each kind of test can run and what breaks elsewhere | ci, runners, importer |
| remote.md | Hosts this service runs on and how to reach them | remote, ssh, staging, hosts |
| glossary.md | Words that mean something specific in this project | glossary, supplier |

## Entries

| Path | Entry | Title | Tags |
|---|---|---|---|
| ci.md | importer-runner | Where the importer integration tests can run | ci, runners, importer |
| remote.md | staging-access | Reaching the staging host | remote, ssh, staging |
| glossary.md | active-item | What "active" means for a supplier item | glossary, supplier |
