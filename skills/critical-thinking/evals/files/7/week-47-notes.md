# Week 47 notes: product search

- Decided at Monday's planning meeting: product search moves to the hosted Meilisearch plan. Running Elasticsearch ourselves was the other option on the table and was turned down. The comparison is in the planning document; the question is closed.
- Done since Monday: index schema defined for products (11 fields); import job written; 182,400 products indexed on staging in 7 minutes.
- Search p95 latency on staging is 38 ms. The old SQL `LIKE` search was at 410 ms.
- The hosted plan costs $30 a month. Billing is set up on the team card.
- Next: switch the production flag on Wednesday at 09:00. The old SQL search code is removed the week after.
- No blockers.
