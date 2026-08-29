---
id: BUG-0290
title: Stop-protection retry loop retries through a documented no-op placeholder
type: bug
status: done
priority: P3
milestone: none
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: []
---

# BUG-0290 — Stop-protection retry loop retries through a documented no-op placeholder

## Symptom

`orderPlacementService.replaceStop()` (`src/services/orderPlacementService.ts`)
only logs "tpsl/place_order is not integrated (FEAT-0070)" — but FEAT-0070 has
since shipped (`status: done`), so that message is now factually wrong on top
of being a no-op. `confirmProtection`'s retry path calls the placeholder anyway
and waits 1.2 s twice (`STOP_RETRY_ATTEMPTS = 2`, `STOP_RETRY_DELAY_MS = 1200`)
— retry theatre during a live unprotected-position window. The final outcome is
honest (`UNPROTECTED` surfaced loudly with `orderEntry.errors.unprotected`);
the error log and warn trail in between are misleading.

## Evidence

**Demonstrated by code inspection** — the placeholder explicitly announces it
does nothing; the retry loop demonstrably spends two fixed delays on it.
Runtime reproduction of harm is not needed: the wasted window is the defect,
not a wrong result. The "not integrated" claim additionally contradicts
[`INTEGRATION_STATUS.md`](../../bitunix-api/INTEGRATION_STATUS.md), which marks
`tpsl/place_order` ✅ (FEAT-0070).

## Cause

FEAT-0070 landed its scaffolding (the call site) before its implementation.
When the implementation shipped, it went through `TpSlCreateModal` only — the
retry path in `orderPlacementService` was never rewired onto the new placement
capability, leaving a stale wiring gap rather than a missing feature.

## Fix

Wire `replaceStop()` to the real placement capability so the retry actually
re-places the stop: `trading.placePositionTpSl({ symbol, positionId,
stopLoss: { price } })` (position-wide plan; partial via `placeTpSlOrder`
needs a quantity-split decision this bug does not need). Gate the call on the
venue's declared TP/SL capability like the rest of the module does. The
just-filled entry's `positionId` must be resolvable from position state inside
the retry window; if it cannot be resolved reliably there, fall back to
removing the placeholder call and its error/warn trail — but then keep at
least one delayed re-read before declaring failure, because the delays are not
pure theatre:

`STOP_RETRY_DELAY_MS` exists because Bitunix attaches entry-borne TP/SL
asynchronously ("a couple of seconds"); immediate re-reads raced that step and
produced false UNPROTECTED alarms for genuinely protected positions. Any
rework must preserve that verification window.

Keep the loud UNPROTECTED surfacing exactly as is.

## Acceptance criteria

- [ ] When the stop is missing after the entry and a retry fires, the TP/SL
      placement API is actually called (asserted with a mock) — failing before
      the fix
- [ ] Late-attach guard: a test where the stop appears only after ≥ 1 retry
      wait still ends `attached`/`placed`, never `failed`/`unprotected` (the
      async-attach window survives the rework)
- [ ] The success path (protection present on first read) is unchanged
- [ ] No code path logs "not integrated (FEAT-0070)" anymore

## Out of scope

- Trailing stops.
- Partial-stop quantity policy on retry (a full-quantity position-wide plan is
  enough; splitting across partial plans is its own decision).
- Reworking confirmation semantics beyond the retry loop (e.g. WS-driven
  confirmation).
- [`FEAT-0070`](../features/FEAT-0070-bitunix-tpsl-placement.md) itself —
  shipped; this item only consumes it.

## Links

- `src/services/orderPlacementService.ts`
- `src/services/tradeService.ts` (`placePositionTpSl`, `placeTpSlOrder`)
- [`FEAT-0070`](../features/FEAT-0070-bitunix-tpsl-placement.md)
- [`INTEGRATION_STATUS.md`](../../bitunix-api/INTEGRATION_STATUS.md)
- Security audit 2026-08-23, finding "stop-retry loop calls a no-op placeholder" (Low)

## State

- Shipped in [PR #2405](https://github.com/mydcc/cachy-app/pull/2405): replaceStop resolves the position id (bounded polls + requestSync), gates on the venue TP/SL capability and calls placePositionTpSl; honest UNPROTECTED surfacing and retry delays unchanged.
