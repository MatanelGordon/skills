# Plan: export-queue

**Status:** draft
**Created:** 2026-11-20   **Base branch:** main

## Goal

Report exports over about 20,000 rows time out, because `POST /reports/:id/export`
builds the CSV inside the request. When this is done the request returns in
under a second with a job id, a worker builds the file, and the user gets a
download link. Success: a 200,000-row export finishes and its link downloads.

## Out of scope

- Excel and PDF formats.
- Scheduled, recurring exports.
- Changing what columns an export contains.

## Background

`src/reports/export.js` streams rows from Postgres and builds the CSV in
memory before responding; the load balancer cuts requests at 30 seconds.
`src/jobs/queue.js` already wraps BullMQ on Redis and runs the nightly digest.
ADR-0007 made that queue the home for background work. Baseline: `npm test`
passes 212 tests in 40 seconds.

## Approach

The endpoint enqueues an `export-report` job and returns `202` with the job
id. A worker builds the CSV in chunks of 5,000 rows, uploads it to the
existing S3 bucket under `exports/`, and marks the job done with a signed URL.
The page polls `GET /exports/:jobId` every 3 seconds. Rejected: raising the
load balancer timeout, which moves the limit instead of removing it; and
streaming the response, which the current reverse proxy buffers.

## Architecture

Browser -> `POST /reports/:id/export` -> queue (`export-report`) -> worker ->
S3 `exports/<jobId>.csv` -> signed URL stored on the job. The browser reads
job state from `GET /exports/:jobId`. Only the worker touches S3.

## File map

| Path | Change | Phase | Owner |
|---|---|---|---|
| `src/jobs/export-report.js` | new worker: chunked CSV, upload, signed URL | 1 | root |
| `src/jobs/export-report.test.js` | new tests | 1 | root |
| `src/reports/export.js` | enqueue and return 202 instead of building the file | 2 | root |
| `src/reports/export-status.js` | new `GET /exports/:jobId` | 2 | root |
| `src/reports/export.test.js` | 202 and status cases | 2 | root |
| `web/reports/ExportButton.tsx` | poll, then show the link | 2 | root |
| `docs/exports.md` | how exports work now | 2 | root |

## Shared surface

None beyond the existing queue wrapper. One agent, sequential.

## Phases

### Phase 1: worker

- [ ] Write `export-report.test.js`; `npm test -- export-report` fails.
- [ ] Implement `export-report.js`; `npm test -- export-report` passes.

### Phase 2: endpoint and page

- [ ] Add the 202 and status cases to `export.test.js`; see them fail.
- [ ] Change `export.js`, add `export-status.js`; `npm test` passes.
- [ ] Update `ExportButton.tsx`; `npm run test:web -- ExportButton` passes.
- [ ] Write `docs/exports.md`.

## Test strategy

### Critical-path tests

```bash
npm test -- export-report
npm test
npm run test:web -- ExportButton
```

### Edge cases

| Case | Axis | Status |
|---|---|---|
| report with zero rows | cardinality | covered: header-only file |
| 200,000 rows | scale | covered: chunked, memory stays flat |
| worker crashes mid-file | failure | covered: BullMQ retries 3 times, then the job is failed |
| same export requested twice | concurrency | covered: second request returns the running job |
| status asked for another user's job | absence | covered: 404 |
| S3 unreachable | failure | covered: job failed with a message the page shows |

### Coverage

Every branch of `export-report.js` by unit tests with a fake S3 client; the
endpoint by handler tests; the button by one component test.

## Definition of done

All three commands pass; `docs/exports.md` is written; a 200,000-row export on
staging produces a link that downloads.

## Risks and unknowns

- Export files pile up in S3 -> a lifecycle rule deletes them (see Q1).
- A signed URL can be forwarded to someone else -> it expires after 1 hour; accepted.
- Q1: How long is an export file kept: 7 days or 30 days -> your call; recommend 7 days; default 7 days.
- Q2: When the file is ready, notify: in the page only, or by email as well -> your call; recommend in the page only; default in the page only.

## Decisions

- `ADR-0007` — background work runs on the BullMQ queue — reused, not reopened.

## Amendments
