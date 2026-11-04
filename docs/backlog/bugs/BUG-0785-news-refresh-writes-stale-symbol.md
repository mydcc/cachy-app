---
id: BUG-0785
title: A slow news refresh writes its result under the new symbol after a fast symbol switch
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: market
data_class: none
adr: none
depends_on: []
assignee: opencode
branch: fix/news-race-and-storage
---

# BUG-0785 — News refresh writes a stale symbol's result (PA-03)

## Symptom

Switching symbols quickly can leave the previous symbol's headline and
sentiment under the new symbol — trading-relevant context assigned to the
wrong market.

## Evidence

Derived when filed; demonstrated by the tests in `src/stores/news.test.ts`
(`BUG-0785` cases), which are red against the unfixed `refresh` and name the
failure directly (`expected 'BTC News' to be 'ETH News'`).

## Cause

`refresh` sets `lastSymbol` and then awaits `fetchNews`/`analyzeSentiment`.
`pendingSymbols` de-duplicates per symbol but does not stop a slower request
for the old symbol from writing after a newer one has landed. A call parked in
the 3 s startup delay was worse: it claimed its generation *after* the delay,
so it could still win against a refresh that had already completed.

## Fix

- A refresh claims a generation when it is accepted, before the startup delay,
  and re-checks it when the delay ends.
- After every `await` the result is discarded unless its generation is still
  current; `isLoading` is only cleared by the current generation.
- A superseded failure is still logged (`logger.warn`) — its state write is
  dropped, the diagnostic is not.
- Switching symbols clears `news`/`sentiment`, so the panel cannot show the old
  market's headlines under the new ticker while the new fetch runs.

## Acceptance criteria

- [x] A refresh parked in the startup delay cannot overwrite a newer symbol's
      news — proven by a test that fails when the generation is claimed after
      the delay
- [x] A slow fetch, a slow sentiment analysis and a stale rejection are each
      dropped, proven by a test that fails when that guard is removed
- [x] A stale completion cannot clear the newer request's `isLoading`
- [x] The stale failure still reaches the log

## Out of scope

- `pendingSymbols` is a `Set`, so two forced refreshes for the same symbol let
  the first one release the entry while the second is still running (LOW,
  pre-existing; the generation guard keeps the data correct).
- `newsStore.error` has no rendering component — a failed refresh still shows
  an empty panel without text. Tracked separately.

## Links

- `src/stores/news.svelte.ts` (`refresh`)
- `src/stores/news.test.ts`
- ADR-0004 (Class C market data, never next to a user identity)
