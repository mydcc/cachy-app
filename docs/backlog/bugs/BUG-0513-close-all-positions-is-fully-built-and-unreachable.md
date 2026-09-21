---
id: BUG-0513
title: Close-all-positions is implemented end to end through gate, signing, venue and simulator, and no caller anywhere in the app reaches it
type: bug
status: done
assignee: opencode
branch: fix-pkg-e-0513-0514
priority: P1
milestone: none
editions: [community, pro, private]
area: execution
data_class: none
adr: none
depends_on: []
---

# BUG-0513 — The panic button with no button

## Symptom

`tradeService.closeAllPositions()` exists, is gated, is signed, is implemented
at the venue, is simulated in paper mode, is permitted by name while the kill
switch is engaged, and is covered by a test and a benchmark. Nothing in the
application calls it.

A trader who wants to flatten everything has to close each position one at a
time.

## Evidence

A repo-wide text search for `closeAllPositions` returns 18 hits. Every one of
them is the declaration, a test, a benchmark, documentation, or a generated
skill file. No component, store, service or route references it:

| layer | status |
|---|---|
| venue implementation | `utils/server/venues/bitunix.ts:141` `closeAllBitunixPositions`, dispatched at `:988` |
| request schema | `types/orderSchemas.ts:133` — `z.literal("close-all-positions")` |
| signing | `utils/exchange/restSigningPlan.ts:72`, `utils/exchange/venueBodies.ts:66` |
| paper simulator | `services/paperExchange.ts:823` `closeAll`, dispatched at `:205` |
| order gate | `services/orderGate.ts:98` lists the kind; `:882` documents that it carries no size |
| kill switch | explicitly allowed while engaged (`rmsService_riskLimits.test.ts:341`) |
| client service | `services/tradeService.ts:1817` |
| tests | `tradeService_native_endpoints.test.ts:116`, `tests/closeAllPositions.bench.ts` |
| **caller** | **none** |

## Corroboration: the only user-visible string names the wrong operation

The failure toast is reached from two places inside the method
(`tradeService.ts:1843`, `:1851`) via `TRADE_ERRORS.CLOSE_ALL_FAILED` →
`trade.closeAllFailed`. Both locales say something else:

```json
"closeAllFailed": "Flash Close fehlgeschlagen für: {failedSymbols}"   // de.json:4177
"closeAllFailed": "Flash Close Failed for: {failedSymbols}"           // en.json:4125
```

Close-all and flash-close are different operations — flash-close is its own
endpoint with its own method (`flashClosePosition`). A string that blames the
wrong one has never been read by anyone, which is independent evidence that
this path has never run in front of a user.

## Why this is financially critical rather than a missing nicety

The kill switch was deliberately written to let this through. The risk-limits
suite asserts it by name: closes, cancels and *bulk closes* stay permitted
while everything else is refused, because blocking an exit mid-panic is worse
than allowing one. That design assumes a bulk close is reachable when the kill
switch is engaged. It is not.

So in the exact state the kill switch exists for — the trader wants out of
everything, now — the app offers the slowest possible route, one position per
confirmation dialog, while the fast path sits complete and unreferenced one
call away.

## Acceptance Criteria

- [x] A user-reachable control flattens all positions, or optionally all
      positions on one symbol (the method already takes that argument).
- [x] The control is reachable while the kill switch is engaged, since the gate
      already permits the operation in that state.
- [x] `trade.closeAllFailed` names close-all, not flash-close, in both locales,
      and `npm run i18n` parity stays green.
- [x] The confirmation the control raises states how many positions and what
      total notional is about to be closed.
- [ ] If the decision is instead that this capability should not exist, the
      whole slice is removed rather than left as reachable-looking dead code —
      including the venue branch and the schema literal. (Not taken — wired
      instead, per user decision for option A + UI variant c.)

## Out of Scope

- The completeness of the non-Bitunix branch once a caller exists — that is
  `BUG-0514`, which is latent only for as long as this item is open.
- `cancelAllOrders`, which is a separate method with its own wiring question.
- Where the control belongs in the UI. That is a design decision, not part of
  the defect.
