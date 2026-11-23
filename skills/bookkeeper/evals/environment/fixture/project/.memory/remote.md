# Remote hosts

> Hosts this service runs on and how to reach them.

<!-- entry:staging-access -->
## staging-access
---
id: staging-access
title: Reaching the staging host
created: 2026-04-09T10:22:31.000Z
updated: 2026-08-27T15:10:02.000Z
tags: [remote, ssh, staging]
links: []
---
Staging runs on `stg-app-2`. The host refuses SSH from anywhere except the
jump host, so every connection goes through the alias `stg-bastion`
(`ssh -J stg-bastion deploy@stg-app-2`). A direct connection does not fail
quickly; it hangs until the client times out.

The alias is written to `~/.ssh/config` by the team's laptop bootstrap, not by
anything in this repository.

The service runs under systemd as `catalog-sync` and is released from
`/srv/catalog-sync/releases/<version>`, with `/srv/catalog-sync/current` as a
symlink to the live one. The deploy key lives in the vault at
`kv/catalog/staging/deploy`; the value is not recorded here.
