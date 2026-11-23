# Plan: search-debounce

**Status:** draft
**Created:** 2026-11-21   **Base branch:** main

## Goal

The search box sends a request on every keystroke, so typing "invoice" fires
seven requests and the results flicker. When this is done the box waits until
typing pauses and drops answers that arrive out of order. Success: typing
"invoice" at normal speed sends one request.

## Out of scope

- Server-side search ranking.
- Caching results between visits.

## Background

`web/search/SearchBox.tsx` calls `searchApi.query` from its `onChange`
handler. `web/lib/useDebounce.ts` exists and is used by the filter panel.
Baseline: `npm run test:web` passes 148 tests.

## Approach

Reuse `useDebounce` with a 250 ms delay, the value the filter panel already
uses. Give each request an `AbortController` and abort the previous one, so a
slow early answer cannot overwrite a later one. Rejected: throttling, which
still sends requests mid-word.

## Architecture

`SearchBox` keeps the raw text in state and passes it through `useDebounce`.
An effect on the debounced value aborts the request in flight and starts the
next. `searchApi.query` gains an optional `signal` argument.

## File map

| Path | Change | Phase | Owner |
|---|---|---|---|
| `web/lib/searchApi.ts` | accept an abort `signal` | 1 | root |
| `web/search/SearchBox.tsx` | debounce the text; abort the stale request | 1 | root |
| `web/search/SearchBox.test.tsx` | one request per pause; stale answer ignored | 1 | root |

## Shared surface

None. One agent, one phase.

## Phases

### Phase 1

- [ ] Add the two cases to `SearchBox.test.tsx`; `npm run test:web -- SearchBox` fails.
- [ ] Change `searchApi.ts` and `SearchBox.tsx`; the same command passes.

## Test strategy

### Critical-path tests

```bash
npm run test:web -- SearchBox
npm run test:web
```

### Edge cases

| Case | Axis | Status |
|---|---|---|
| text cleared while a request is in flight | absence | covered: aborted, results emptied |
| two answers arrive in reverse order | time | covered: the earlier one is aborted |
| component unmounts mid-request | failure | covered: aborted in the effect cleanup |

### Coverage

The two new behaviours by component tests with fake timers.

## Definition of done

Both commands pass, and typing "invoice" in the running app shows one request
in the network panel.

## Risks and unknowns

- A 250 ms pause feels slow to fast typists -> same delay as the filter panel, which has had no complaints; accepted.
- An aborted request still costs the server work -> the query is cheap (indexed, under 20 ms); accepted.

## Decisions

None. Nothing here is hard to reverse.

## Amendments
