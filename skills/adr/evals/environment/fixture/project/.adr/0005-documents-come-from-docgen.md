# Documents come from docgen, never from inside this API

Status: accepted

Anything a customer downloads or prints is produced by the separate `docgen`
worker. This API inserts a row into `render_jobs`, answers 202 with a status
URL, and docgen writes the finished file to object storage. The API containers
are capped at 512 MB and share one event loop with checkout, so a rendering
spike must never be able to slow or kill order intake.

## Constraints this creates

- No rendering library and no headless browser in this service's dependencies.
- Document endpoints are asynchronous: 202 and polling, not a streamed file.
