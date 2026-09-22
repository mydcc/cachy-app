---
id: BUG-0514
title: Close-all on any non-Bitunix venue iterates the cached position list, so a position the cache is missing survives the flatten and the call still reports success
type: bug
status: done
assignee: opencode
branch: fix-pkg-e-0513-0514
priority: P2
milestone: none
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: [BUG-0513]
---

# BUG-0514 — Two venues, one button, two different guarantees

## Symptom

`closeAllPositions` branches on the provider and the two branches promise
different things:

```ts
if (provider === "bitunix") {
    return await this.gatedRequest({ kind: "bulk", payload: { type: "close-all-positions", … } });
}

// Fallback for non-Bitunix providers
const positions = omsService.getPositions();
const toClose = symbol ? positions.filter(p => p.symbol === symbol) : positions;
const promises = toClose.map(p => this.closePosition({ … }));
```

- **Bitunix** — one request. The venue enumerates its own positions, so the
  result is complete by construction. `tradeService_native_endpoints.test.ts:117`
  asserts this by name: *"issues a single request with type=close-all-positions
  without client-side position loops"*.
- **Everything else** — a loop over `omsService.getPositions()`, the local
  cache. Complete only if the cache is complete.

The test's own title records that the team treats the client-side loop as the
inferior path. Bitget silently gets it.

## Mechanism

Anything the cache is missing is never attempted:

- a position opened in Bitget's own UI, on a phone, or by another tool;
- a symbol whose position snapshot never arrived, or arrived partially
  (`BUG-0065` is the same store's partial-push class);
- a position that appeared while the WebSocket was down — the app deliberately
  keeps showing cached positions across a disconnect rather than blanking the
  panel (`appEffects.svelte.ts`, FEAT-0026 note), so the cache being behind is
  an accepted state, not an anomaly.

It is not reported as a failure either. `results.filter(r => r.status === "rejected")`
only sees the closes that were *attempted*. A position that was never in
`toClose` produces no rejection, no toast, and no entry in `failedSymbols`. The
call returns normally and the trader reads that as flat.

## The fresh list arrives and is discarded

`closePosition` calls `ensurePositionFreshness` (`tradeService.ts:1028`), which
on a stale or missing position calls `fetchOpenPositionsFromApi()` — a full
refresh of every position, not just the one asked about.

So when any position in the loop is older than `MAX_POS_AGE_MS` (200 ms), the
loop's first iteration pulls an authoritative, complete list from the exchange.
`toClose` was computed before the loop and cannot grow. The very data that
would reveal the missing position is fetched, written to the store, and then
ignored for the remainder of the flatten.

## Why P2 and not higher

Latent while `BUG-0513` is open: nothing calls `closeAllPositions` today, so
neither branch runs in production. This item exists so the gap is visible at
the moment a caller is added — wiring the control (BUG-0513) makes this live on
Bitget the same day, and an item discovered after that wiring would be found by
a trader rather than by a reader.

## Acceptance Criteria

- [x] The non-Bitunix branch fetches positions from the exchange before
      computing its work list, rather than reading the cache.
- [x] A position discovered during the flatten is included in it, or the call
      reports explicitly that it stopped short and names what it left open.
- [x] Success is not reported while a position on the account remains open —
      a post-flatten read confirms flat, or the result says it could not
      confirm.
- [x] Bitget's native bulk-close endpoint is used if one exists; if it does
      not, a comment states that, so the next reader does not re-derive it.
- [x] Regression test: cache holds one position, exchange holds two — assert
      the second is closed or explicitly reported, and that the call does not
      report plain success.

## Out of Scope

- Wiring a caller. That is `BUG-0513`.
- The cache-vs-exchange question on the single-position paths, which already go
  through `ensurePositionFreshness` and are covered.
- `BUG-0065`'s partial-push mechanism itself; this item only relies on the
  cache being able to lag, which is documented and intended.
