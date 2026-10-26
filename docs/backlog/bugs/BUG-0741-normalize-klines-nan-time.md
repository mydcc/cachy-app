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

A kline that carries `open` and `close` but none of the timestamp aliases comes
out of `mdaService.normalizeKlines` with `time: NaN`.

The damage happens one layer down: `KlineBufferManager` decides between
updating the last candle and appending a new one with
`newRaw.time === lastKline.time`
(`src/stores/market/klineBuffers.ts:124`). `NaN !== NaN`, so the in-place
update never matches and the append path runs — one extra candle per push for
as long as the timestamp stays missing. The chart hides this: it drops candles
whose time is not finite before rendering, so the visible series looks
correct while the buffer keeps growing.

Bitunix payloads normally do carry the message-level `ts`, so no incident is
known. The path is reachable all the same, because nothing validates it: the
kline fast path only requires `open` or `close`
(`src/services/bitunixWs/messageParser.ts:81`), and both call sites degrade a
missing `ts` to `undefined` (`messageParser.ts:97`,
`channelDispatch.ts:213`).

## Evidence

**Derived** — the mechanism follows from the code and a direct call to the
adapter reproduces the `NaN`; it was not observed as an incident. BUG-0248
fixed the case that had been observed (Bitunix `market_kline_*` pushes carry
`ts` at message level, not inside `data`), and added tests for it.

`src/services/mdaService.ts:99` guards only `open` and `close`:

```ts
const open = k.open || k.o;
const close = k.close || k.c;
// Invalid candle check
if (open === undefined || close === undefined) return null;

return {
    time: Number(k.time || k.t || k.ts || k.timestamp),
```

The generic/Bitget branch repeats the shape at `:123` and `:126` with
`Number(k[0] || k.time)`. With every alias absent, the OR chain is
`undefined` and `Number(undefined)` is `NaN`; `time` has no post-condition —
unlike `normalizeTicker`, which returns `null` for a missing `lastPrice`.

The call-site guard is conditional, not a guarantee
(`src/services/bitunixWs/channelDispatch.ts:49-60`):

```ts
if (typeof ts === "number" && Number.isFinite(ts) && ts > 0) {
  ...
  raw.time = Math.floor(ts / intervalMs) * intervalMs;
}
return raw;
```

So `withKlineTime` leaves the payload untouched when `ts` is missing or not a
number — the adapter then produces the `NaN` candle described above.

`src/services/mdaService.test.ts` covers `normalizeTicker` only. There is no
test for `normalizeKlines`, so the missing guard never surfaced as a red test.

## Cause

`Number()` applied to an unchecked alias chain. The existing invalid-candle
guard defines a usable candle as "has open and close", while every consumer
also needs a finite timestamp: the buffer keys updates by it, and indicator
windows index by it.

## Fix

Drop the candle when the parsed time is not a finite, positive number, in both
the Bitunix and the generic branch — the same shape as the existing
open/close guard.

Leave the call-site injection alone: `withKlineTime` is what makes the
WebSocket path correct when `ts` is present, and it should stay in place so
the fast path does not depend on rejection. Do not substitute `Date.now()`:
an invented time would overwrite or append a candle that never existed.

## Acceptance criteria

- [ ] `src/services/mdaService.test.ts` covers both branches: a kline with a valid time keeps it, a kline with no time alias is dropped instead of returned with `NaN`
- [ ] The new test fails without the fix (returned candle with `NaN`) and passes with it
- [ ] A `dispatchMessage` test feeds a `market_kline` message without a numeric `ts` and asserts that no candle with a non-finite time reaches the buffer
- [ ] The existing `channelDispatch` timestamp tests stay green — call-site injection is unchanged

## Links

- BUG-0248 — found the NaN-time mechanism, fixed the observed WebSocket path by injecting `time` in `channelDispatch`
- `src/stores/market/klineBuffers.ts:124` — the comparison that never matches a NaN time
- Audit that filed this finding: exchange ingestion / MDA layer audit, 2026-10-25 (reported there as P1; P2 here because no milestone depends on it and the normal payload carries a timestamp)
