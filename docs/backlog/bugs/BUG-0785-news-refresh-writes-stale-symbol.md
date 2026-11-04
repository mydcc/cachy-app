---
id: BUG-0785
title: A slow news refresh writes its result under the new symbol after a fast symbol switch
type: bug
status: in-progress
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

Derived — `src/stores/news.svelte.ts` (`refresh`). Production audit PA-03.

## Cause

`refresh` sets `lastSymbol` and then awaits `fetchNews`/`analyzeSentiment`.
`pendingSymbols` de-duplicates per symbol but does not stop a slower request
for the old symbol from writing after a newer one has landed.

## Fix

A generation counter is incremented when a real fetch starts. After every
`await`, the result is discarded unless its generation is still current;
`isLoading` is only cleared by the current generation.

## Verification

New test in `src/stores/news.test.ts` — a slow BTC fetch racing a fast ETH
refresh leaves ETH's news in place. RED against `origin/develop`
(`expected 'BTC News' to be 'ETH News'`), GREEN after the fix.
