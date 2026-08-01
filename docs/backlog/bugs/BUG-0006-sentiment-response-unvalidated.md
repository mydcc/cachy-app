---
id: BUG-0006
title: Sentiment cache and AI response are trusted without schema validation
type: bug
status: specced
priority: P2
milestone: M0
editions: [community, pro, private]
area: ai
data_class: none
adr: none
depends_on: []
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

- [ ] A test feeds a malformed provider response and asserts the neutral
      fallback, not a crash or a bad `regime`
- [ ] A test feeds a corrupted IDB entry and asserts the same
- [ ] Both tests fail before the fix

## Links

- [`docs/TODO.md`](../../TODO.md) item 7
- `src/services/newsService.ts` — `analyzeSentiment()`
