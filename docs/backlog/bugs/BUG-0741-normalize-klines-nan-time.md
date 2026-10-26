---
id: BUG-0741
title: normalizeKlines returns a NaN candle time instead of dropping a timestamp-less kline
type: bug
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: []
---

# BUG-0741 — normalizeKlines returns a NaN candle time instead of dropping a timestamp-less kline

## Symptom

A kline object that carries `open` and `close` but none of the timestamp
aliases still comes out of `mdaService.normalizeKlines` — with `time: NaN`.
Every consumer that keys candles by time then has a candle no update can ever
match, so an in-place refresh is skipped and a duplicate is appended instead.

Nobody sees this in production today: BUG-0248 traced the one path that
produced it (Bitunix `market_kline_*` pushes carry `ts` at message level, not
inside `data`) and fixed the call site. The adapter itself still accepts the
input, so the next caller that forgets to inject a timestamp reintroduces the
defect silently.

## Evidence

**Derived** — the defect follows from the code; it was not observed as an
incident after BUG-0248 shipped. A direct call to the adapter reproduces it.

`src/services/mdaService.ts:99` guards only `open` and `close`:

```ts
const open = k.open || k.o;
const close = k.close || k.c;
// Invalid candle check
if (open === undefined || close === undefined) return null;

return {
    time: Number(k.time || k.t || k.ts || k.timestamp),
```

The generic/Bitget branch has the same shape with `Number(k[0] || k.time)`.

When every alias is absent the OR chain evaluates to `undefined` and
`Number(undefined)` is `NaN`. `time` has no post-condition — unlike
`normalizeTicker`, which returns `null` for a missing `lastPrice`.

`src/services/mdaService.test.ts` covers `normalizeTicker` only; there is no
test for `normalizeKlines` at all, which is why the missing guard never
surfaced as a red test.

## Cause

`Number()` applied to an unchecked alias chain. The existing invalid-candle
guard defines "usable candle" as "has open and close", but every downstream
consumer also requires a finite timestamp.

## Fix

Drop the candle when the parsed time is not a finite, positive number, in both
the Bitunix and the generic branch — the same shape as the open/close guard
that is already there.

Leave the call-site injection alone: `src/services/bitunixWs/channelDispatch.ts`
(`withKlineTime`) is what makes the WebSocket path correct, and it should stay
in place so the fast path does not depend on rejection.

## Acceptance criteria

- [ ] `src/services/mdaService.test.ts` covers both branches: a kline with a valid time keeps it, a kline with no time alias is dropped instead of returned with `NaN`
- [ ] The new test fails without the fix (returned candle with `NaN`) and passes with it
- [ ] The existing `channelDispatch` tests stay green — call-site injection is unchanged

## Links

- BUG-0248 — fixed the WebSocket path that produced NaN candle times by injecting `time` before normalization
- Audit that filed this finding: exchange ingestion / MDA layer audit, 2026-10-25 (originally reported as P1; P2 here because the production path is already fixed and no milestone depends on it)
