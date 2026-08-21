# ADR templates

Three tiers. **Start at tier 1** — most decisions never need more, and a long ADR
nobody reads is worse than a short one they do. Escalate only when the decision
was genuinely contested.

Drawn from [Michael Nygard's original ADR](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
(Context / Decision / Consequences), [MADR](https://adr.github.io/madr/)
(Decision Drivers, Considered Options, Confirmation), and Zdun's
[Y-statements](https://medium.com/olzzio/y-statements-10eb07b5a177) for the
one-line form.

## Constraints these must respect

The same body is used two ways, and the tag form is the restrictive one:

| | `.adr/NNNN-*.md` file | annotated tag body |
|---|---|---|
| `# Title` heading | yes | **no — stripped as a comment.** Plain first line, or `--cleanup=verbatim` |
| Trailers | optional | must be the **last paragraph**, one per line |
| Wrapped prose in the trailer block | fine | **breaks every trailer** — indent continuations |

Write the body once, plain-title form, and it works in both. Verified on git 2.50.1.

---

## Tier 1 — minimal (the default)

Title, a short paragraph, trailers. This is a complete ADR.

```
Use a hand-written tokenizer instead of split()

Quoted fields and escapes made split() wrong in a way that only showed up on
customer data. A hand-written tokenizer beats a CSV library here because the
import path is hot and the library needs equivalent configuration anyway.

Tags: parser, csv, performance
Constraint: parser must handle RFC4180 quoting
Reversibility: clean
```

If you can say it in a paragraph, say it in a paragraph.

### The Y-statement compression

When the opening sentence is hard to write, this shape forces every part out:

> In the context of **\<use case\>**, facing **\<concern\>**, we chose
> **\<option\>** over **\<alternatives\>**, to achieve **\<quality\>**,
> accepting **\<downside\>**.

Useful as a thinking tool even when the final prose reads normally — if you
can't fill a slot, that part of the decision isn't made yet.

---

## Tier 2 — standard (Nygard shape)

When consequences aren't obvious from the decision itself.

```
Route cross-context communication through domain events

Context
Ordering called Billing over synchronous HTTP. Deploys had to be coordinated,
and a Billing outage took Ordering down with it. Both already publish to the
existing bus for other purposes.

Decision
All cross-context calls go through domain events on the existing bus. No
synchronous HTTP between bounded contexts. Within a context, direct calls stay.

Consequences
Contexts deploy independently and survive each other's outages. Reads that
needed an immediate answer now need a local projection, which is new code and
new staleness to reason about. Debugging spans two logs instead of one.

Tags: architecture, messaging, coupling
Constraint: no synchronous calls across context boundaries
Reversibility: migration-needed
Tested: contract tests per event, both sides
```

**Consequences must include the bad ones.** An ADR listing only benefits is
advocacy, not a record — and the next person needs the downside to judge whether
conditions have changed.

---

## Tier 3 — full (MADR shape)

Only when alternatives were genuinely close and someone will re-litigate this.

```
Adopt Postgres as the primary datastore

Context and problem statement
We need durable storage for orders and a read model for the dashboard. Expected
scale is ~5k writes/min at peak, with reporting queries that join across five
entities. The team has no dedicated DBA.

Decision drivers
- Joins across entities are core to reporting, not incidental
- Operational burden must stay near zero; no dedicated DBA
- Must run identically on a laptop and in CI
- Existing team fluency

Considered options
1. Postgres — mature joins, one operational story, team knows it
2. DynamoDB — near-zero ops, but reporting joins become application code
3. Mongo — flexible documents, but the reporting queries are relational
4. Postgres + a read replica later — same as 1 with a known scaling path

Decision outcome
Chose Postgres (option 4's path), because the reporting workload is relational
and the alternatives push that complexity into application code we would then
own. DynamoDB was closest and was rejected only on the join requirement — if
reporting moves to a warehouse, that rejection should be revisited.

Consequences
Good: one datastore, local/CI parity, joins stay in SQL, well-understood scaling.
Bad: vertical scaling ceiling we will eventually hit; we own backups and
migrations; a schema change is now a deploy-ordering concern.

Confirmation
Migrations run in CI against a container; the reporting queries have EXPLAIN
assertions in the perf suite that fail if a sequential scan appears.

Tags: datastore, architecture, postgres
Constraint: reporting queries must be expressible in SQL, not application joins
Rejected: DynamoDB | reporting joins would move into application code
Reversibility: irreversible
Tested: migration suite in CI, EXPLAIN assertions in the perf suite
```

**Confirmation** is the most-skipped and most-valuable MADR section: how would
anyone *detect* that the decision has been violated? A test, a lint rule, an
architecture fitness function. Without it, a constraint decays silently.

---

## Sections map onto trailers

Keep the prose and the machine-readable metadata consistent — the trailers are
what `adr.sh` searches, so a constraint stated only in prose is invisible.

| Prose section | Trailer |
|---|---|
| the subsystem/concern this is about | `Tags:` |
| a rule that stays true afterwards | `Constraint:` |
| an alternative and why not | `Rejected:` |
| how hard to undo | `Reversibility:` |
| Confirmation | `Tested:` |
| the file, issue, or related ADR | `Refs:` |

If a section has no matching trailer, that's fine. If a **trailer** has no
matching prose, the ADR is under-explained.

---

## Status and supersession

Tier 1 needs no status — an existing tag is an accepted decision.

Add `Status:` when a decision is proposed-but-not-taken, or has been replaced:

```
Status: superseded by adr-0011
```

**Never delete or rewrite an ADR.** The superseded one explains why the previous
approach was chosen and what changed — usually the most valuable thing in the
record. Tags are immutable by convention; if you must correct one,
`git tag -f` rewrites it and everyone who fetched the old one keeps it, so prefer
a new ADR that supersedes.

## Choosing a tier

| Situation | Tier |
|---|---|
| Obvious in hindsight, one real option | don't write one at all |
| Clear decision, non-obvious reason | 1 |
| Consequences that will surprise someone | 2 |
| Two credible options, will be re-argued | 3 |
| Irreversible, or expensive to unwind | 3, with `Confirmation` |
