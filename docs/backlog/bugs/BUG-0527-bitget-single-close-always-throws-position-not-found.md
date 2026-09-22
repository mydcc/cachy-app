---
id: BUG-0527
title: Single close and flash close on Bitget always throw POSITION_NOT_FOUND because nothing feeds the OMS there
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: []
---

# BUG-0527 — Bitget closes fail before they start

## Symptom

On the Bitget venue, closing a single position — through the close dialog,
the flash-close button, or any other caller of `tradeService.closePosition`
— throws `POSITION_NOT_FOUND` without ever sending a request. The trader sees
a failure toast for a position that is plainly open on the account.

## Evidence

**Derived** — follows from reading the code, not yet observed live.

`ensurePositionFreshness` (`src/services/tradeService.ts`) resolves the
position exclusively through `omsService.getPositions()`, with
`fetchOpenPositionsFromApi()` as the only fallback — which returns early for
any non-Bitunix provider. On live Bitget nothing writes to the OMS at all:

- `bitunixWs/channelDispatch.ts:260,266` feeds it from the Bitunix WS channel
- `tradeService.ts:1480` feeds it from the Bitunix-only REST refresh
- `paperTradingService.ts:300,309` feeds it from the simulator mirror

`bitgetWs.ts` contains zero OMS references, and `accountState` (which does
hold Bitget positions, hydrated via `/api/positions`) never propagates into
the OMS. So the lookup misses, the Bitunix-only fallback no-ops, and
`closePosition` throws `POSITION_NOT_FOUND`.

Note: `closePosition` travels as a reduce-only `place-order`, not as the
`close-position` schema shape — the venue body for Bitget needs only
symbol, side, amount and margin coin. The missing piece is the amount
resolution, not the wire format.

Discovered while fixing BUG-0514: the close-all fallback loops the same
`closePosition`, so it inherits this. The fallback's own exchange-fresh
mirror (`mirrorPositionsToOms`) covers the bulk path only.

## Cause

The OMS is Bitunix-fed by construction; Bitget was never connected to it.
BUG-0514's item assumed the single-position paths "are covered" on Bitget —
that assumption is false.

## Fix

Feed the OMS on Bitget (WS position channel and/or the `/api/positions`
refresh, mirroring the Bitunix paths), or resolve close amounts from the
fresh exchange read instead of the OMS. Do not special-case closes to
bypass `ensurePositionFreshness` — the 200 ms staleness rule is what keeps
a close from sizing off a dead number.

What to leave alone: the close-all fallback's own mirror in
`tradeService.closeAllPositions` already covers the bulk path; this item is
about the single/flash paths (`closePosition`, `flashClosePosition`,
`addToPosition` reads the same store).

Note (from the #3564 review): the bulk mirror tracks its keys
(`mirroredOmsKeys`) and the post-flatten read evicts tracked keys the
exchange no longer lists, so flattened positions do not linger as OMS
ghosts a later single close would size off. Whatever feed fixes this item
should offer the same guarantee — a write-only mirror without eviction
recreates the ghost problem one layer down.

## Acceptance criteria

- [ ] A test reproduces the defect (Bitget provider, position present on the
      exchange read, absent from the OMS) and fails without the fix
- [ ] The test passes with the fix: the close sends one reduce-only order
      with the exchange-fresh amount
- [ ] Paper mode and the Bitunix paths are unaffected (their suites stay green)
- [ ] No new venue wire format is guessed — amounts come from reads Cachy
      already performs (BUG-0001)

## Links

- BUG-0514 — whose fallback inherits this through `closePosition`
- BUG-0513 — the close-all wiring that made the bulk path live
- FEAT-0525 — the Bitget reference that should record the OMS feed gap
