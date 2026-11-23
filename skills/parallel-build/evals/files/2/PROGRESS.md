# PROGRESS — split-billing-service

**Status:** phase 2 of 3 — in progress
**Updated:** 2026-11-20 14:10
**Repo:** /work/billing   **Base branch:** main
**Plan:** ./plan.md
**Security phase:** enabled

## Resume here
p2-invoices is verified and merged. Wait for p2-webhooks and p2-dunning, then
verify and merge each. Then dispatch phase 3.

## Phases
- [x] Phase 1 — foundation — merged
- [ ] Phase 2 — implementation — 1/3 merged, 2 running
- [ ] Phase 3 — review — not started

## Agents
| Slug | Phase | Tool | Worktree | Branch state | Status |
|---|---|---|---|---|---|
| p1-foundation | 1 | codex/high | removed | merged | DONE |
| p2-invoices | 2 | codex/high | removed | merged | DONE |
| p2-webhooks | 2 | codex/high | live | in progress | RUNNING since 13:20 |
| p2-dunning | 2 | copilot/sonnet-5 | live | in progress | RUNNING since 13:21 |

## Todos
- [ ] verify + merge p2-webhooks
- [ ] verify + merge p2-dunning
- [ ] dispatch phase 3
