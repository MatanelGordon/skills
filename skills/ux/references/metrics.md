# UX metrics

## SUS — System Usability Scale

Ten statements, alternating positive and negative, each answered 1 (strongly
disagree) to 5 (strongly agree):

1. I think that I would like to use this system frequently
2. I found the system unnecessarily complex
3. I thought the system was easy to use
4. I think that I would need the support of a technical person to be able to use this system
5. I found the various functions in this system were well integrated
6. I thought there was too much inconsistency in this system
7. I would imagine that most people would learn to use this system very quickly
8. I found the system very cumbersome to use
9. I felt very confident using the system
10. I needed to learn a lot of things before I could get going with this system

**Scoring** (this is where people go wrong):

- Odd-numbered items: score = answer − 1
- Even-numbered items: score = 5 − answer
- Sum all ten (range 0–40), then **multiply by 2.5** → 0–100

```python
def sus(answers: list[int]) -> float:
    """answers: 10 responses, each 1-5, in question order."""
    if len(answers) != 10 or not all(1 <= a <= 5 for a in answers):
        raise ValueError("need 10 answers in 1..5")
    total = sum((a - 1) if i % 2 == 0 else (5 - a) for i, a in enumerate(answers))
    return total * 2.5
```

**The result is not a percentage.** 68 is not "68% usable" — it is the industry
average, i.e. the 50th percentile.

| Score | Grade | Percentile |
|---|---|---|
| ≥ 80.3 | A | top ~10% |
| 74 | B− | ~70th |
| 68 | C | 50th — average |
| 51–67 | D | below average |
| < 51 | F | bottom ~15% |

**Use it for**: tracking one product over time, or comparing two variants.
**Don't use it for**: diagnosing *what* is wrong — it gives you a number, not a
cause. Pair it with the heuristic audit.

Roughly 12–15 respondents give a usable estimate; fewer produces a number too
noisy to act on. Always report the spread alongside the mean.

## SEQ — Single Ease Question

Immediately after each task: *"Overall, how difficult or easy was that task?"*
1 (very difficult) → 7 (very easy).

The cheapest useful metric that exists. One question, per task, so it localizes
friction the way SUS cannot. Around 5.5 is typical; below ~5 marks a task worth
investigating.

## Task-based metrics

**Task success rate** — % of participants completing unaided, with a *pre-declared*
success criterion. Decide what counts as success before running, or you will
rationalize partial completions.

- Report as `successes / attempts` with the count, not just a percentage — "4/5"
  is honest about the sample in a way "80%" is not.
- ~78% is a common average across studies; a critical path should be far higher.
- Distinguish *unaided success*, *success with a hint*, and *failure*. The middle
  category is where the design problem lives.

**Time on task** — median (not mean; outliers dominate) seconds from start to
success, counting only successful attempts. Meaningful only as a comparison:
against the prior version, a competitor, or an expert baseline. Report the spread
— a wide distribution means some users are lost even if the median looks fine.

**Error rate** — errors per attempt, split into *recovered* and *unrecovered*. An
unrecovered error on a core task is severity 3 or 4 by definition.

## HEART with Goals–Signals–Metrics

Pick dimensions relevant to the decision. Never fill in all five by default.

| Dimension | Goal (example) | Signal | Metric |
|---|---|---|---|
| Happiness | Users find sharing pleasant | Positive/negative sentiment after sharing | SEQ after share; quarterly SUS |
| Engagement | Teams collaborate regularly | Repeat sharing within a workspace | Shares per active workspace per week |
| Adoption | New teams try sharing | First share by a new workspace | % of new workspaces sharing in week 1 |
| Retention | Sharing keeps teams active | Workspaces that shared return | Week-4 return rate, sharers vs non-sharers |
| Task success | Sharing is easy to get right | Completed share without error | Completion rate; time to first share; permission-error rate |

The chain matters more than the table: **state the goal, decide what behavior
would signal it, then choose a metric that captures that signal.** Metrics picked
without a goal measure whatever is easiest to instrument.

## Choosing a starter set

Minimum viable measurement for a team that measures nothing today:

1. **Task success rate** on the two most important tasks
2. **SEQ** after each of those tasks
3. **Error rate**, split recovered/unrecovered

Add **SUS quarterly** once those are stable, for a benchmark trend. That is
enough; a dashboard beyond 6–8 metrics is noise rather than signal.

## Interpreting responsibly

- **Trends over points.** One measurement has no error bar you can see. Two
  measurements under the same conditions have a direction.
- **Behavioral over attitudinal when they conflict.** What people do beats what
  they say. If SUS is high but task success is low, believe the task data.
- **Engagement is ambiguous.** More time and more clicks can mean *more engaged*
  or *more lost*. Always pair with task success.
- **Don't average across dissimilar tasks.** A 90% mean across ten tasks can hide
  a 20% catastrophe on the one that pays the bills.
- **Watch for the team effect.** Anyone who helped build it has the mental model
  and cannot produce a valid first-run measurement.
- **Sample honestly.** Five participants is enough to *find* problems, not enough
  to *quantify* them. Report which you're doing.
