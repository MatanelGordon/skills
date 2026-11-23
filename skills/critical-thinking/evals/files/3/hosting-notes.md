# Side project: where to put Postgres

## The project

- A recipe-sharing web app with about 40 users, all in Germany.
- The app runs on a VPS in Frankfurt that I already rent: $6 a month, 1 vCPU, 1 GB RAM (the app uses about 450 MB), 25 GB disk.
- The database is Postgres 16, 300 MB, growing about 10 MB a month.
- Today it runs in Docker on my laptop, so the site is down whenever the laptop lid is closed.
- Hard limits: at most $10 a month for the database, and the data stays in the EU.
- I have one free evening, about 3 hours, to set this up.

## Candidates I have looked at

1. Serverless Postgres, free tier. $0 while the database is under 0.5 GB; the next tier is $19 a month. EU region. It sleeps after 5 idle minutes and the first query after that takes about 1 second. Setup about 30 minutes. Moving away later is a dump and restore, about 30 minutes.
2. Postgres in Docker on the VPS I already rent. $0 extra, plus about $1 a month of object storage for backups. I write the backup job and do the upgrades myself. It shares the 1 GB of RAM with the app. Setup about 2 hours.
3. A second VPS only for Postgres. $4.50 a month, Frankfurt, 2 GB RAM of its own. Same backups and upgrades by hand as candidate 2. Setup about 3 hours.
4. Hobby plan at a managed database host. $5 a month, EU region, 1 GB storage, daily backups included. A database on this plan is deleted after 90 days without a login to their dashboard. Setup about 30 minutes.
5. Managed database from my VPS provider. $9 a month for the smallest size, Frankfurt, daily backups and minor upgrades included. Setup about 45 minutes.
6. Managed instance at a big cloud provider. $38 a month for the smallest size, EU region, backups and failover included. Setup about 2 hours, most of it network and access rules.
