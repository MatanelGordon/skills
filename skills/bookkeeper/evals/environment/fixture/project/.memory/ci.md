# CI

> Where each kind of test can run and what breaks elsewhere.

<!-- entry:importer-runner -->
## importer-runner
---
id: importer-runner
title: Where the importer integration tests can run
created: 2026-06-18T08:41:07.000Z
updated: 2026-09-02T13:05:44.000Z
tags: [ci, runners, importer]
links: [test/importer.integration.test.js]
---
The importer integration tests pass only on the self-hosted runner
`win-build-03`. It is the one machine with the supplier's ODBC driver and the
`SupplierStock` data source installed; the driver is licensed per machine and
there is no Linux build of it.

On GitHub-hosted runners the tests fail with `IM002 Data source name not found`.
That looks like a bug in the importer and is not one.

The runner carries the labels `self-hosted` and `win-build-03`. It is switched
off between 01:00 and 03:00 UTC for backups.
