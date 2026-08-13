---
id: BUG-0006
title: Sentiment cache and AI response are trusted without schema validation
type: bug
status: done
priority: P2
milestone: M0
editions: [community, pro, private]
area: ai
data_class: none
adr: none
depends_on: []
estimate: 3
size: M
target_date: 2026-11-06
---

# BUG-0006 — Sentiment cache and AI response are trusted without schema validation

## Symptom

A malformed or schema-drifted AI sentiment response, or a corrupted IndexedDB
entry, flows straight into typed state and out to the UI instead of falling back
to the neutral-sentiment error path that already exists.

## Evidence

**Derived.** Full analysis: [`../../TODO.md`](../../TODO.md) item 7.

`newsService.ts`'s `analyzeSentiment()` trusts two values by cast, with no
runtime check: the IDB read (`dbService.get<{...}>(...)` — a type parameter, not
a validation) and the provider response (`const analysis: SentimentAnalysis =
data.analysis;` — an annotation on untrusted JSON).

This is inconsistent with the rest of the same file: `fetchNews()` validates its
IDB cache through `NewsCacheEntrySchema.safeParse()`, and the upstream news
responses are validated server-side. The sentiment path is the one that skips
it. Two schemas for exactly this — `SentimentAnalysisSchema` and
`SentimentCacheSchema` — were defined and never referenced, and were removed
during a lint pass.

## Fix

Reinstate both schemas and `safeParse()` the two reads, falling back to the
`{ score: 0, regime: "UNCERTAIN", ... }` response the `catch` block already
returns for every other failure.

## Acceptance criteria

- [x] A test feeds a malformed provider response and asserts the neutral
      fallback, not a crash or a bad `regime`
- [x] A test feeds a corrupted IDB entry and asserts the same
- [x] Both tests fail before the fix

## Resolution

**RESOLVED** (2026-08-10). Reinstated `SentimentAnalysisSchema` and
`SentimentCacheSchema` in `newsService.ts` (recovered from the commit that
removed them, unchanged) and wired `safeParse()` into both reads:

- The IDB read now validates through `SentimentCacheSchema.safeParse()`,
  mirroring `fetchNews()`'s existing pattern — on mismatch it logs a
  warning, deletes the corrupted entry, and falls through as if there were
  no cache, rather than returning a value with an untrustworthy shape.
- The AI provider response now validates `data.analysis` through
  `SentimentAnalysisSchema.safeParse()` before assigning it to the typed
  `analysis` variable — on mismatch it logs and throws, landing in the
  existing `catch` block's neutral-sentiment fallback (`{ score: 0, regime:
  "UNCERTAIN", ... }`), the same path every other failure mode in this
  function already takes.

Verified by `src/services/newsService_sentiment.test.ts` (3 tests): a
malformed provider response falls back to neutral instead of propagating a
bad `regime`; a corrupted IDB cache entry is discarded (and deleted) rather
than trusted, falling through to a fresh fetch; a well-formed cache entry
still returns unchanged without hitting the network. The first two were
confirmed to fail against the pre-fix code (temporarily reverting
`newsService.ts` while keeping the tests) before being made to pass.

## Links

- [`docs/TODO.md`](../../TODO.md) item 7
- `src/services/newsService.ts` — `analyzeSentiment()`
