---
id: BUG-0055
title: Position mark price always renders as "0 → 0"
type: bug
status: specced
priority: P1
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: []
---

# BUG-0055 — Position mark price always renders as "0 → 0"

## Symptom

An open position's card shows `entryPrice → 0` (or `0 → 0` before the entry
price arrives) instead of a live mark price, and the position tooltip's
derived "Value" and other mark-price-based fields are wrong as a result —
even though leverage and margin mode render correctly. The user needs the
current price at a glance and cannot get it from this panel.

## Evidence

**Derived, not demonstrated** — confirmed by cross-reading the Bitunix API
docs in this repo against the store and WS handler; no live account was
required to see the mismatch, since the data source simply does not exist on
the path currently read.

Three-layer chain:

1. Bitunix **never returns `markPrice`** for a position, on either transport:
   - REST `Get Pending Positions` response parameters
     (`docs/bitunix-api/05_position.md:103-129`) list `qty, entryValue, side,
     marginMode, positionMode, leverage, fee, funding, realizedPNL, margin,
     unrealizedPNL, liqPrice, marginRate, avgOpenPrice, ctime, mtime,
     subAccountId` — no mark price field.
   - Private WS Position Channel push parameters
     (`docs/bitunix-api/08_websocket.md:261-291`) carry no price field at
     all beyond what's derivable from margin/PnL.
   - Mark price **is** available, just not through the position endpoints:
     public REST `Get Tickers` (`docs/bitunix-api/04_market.md:229-245`,
     field `markPrice`) and the public WS `price` channel
     (`docs/bitunix-api/08_websocket.md:498-509`, field `mp`).
2. `src/stores/account.svelte.ts`'s `Position` interface declares
   `markPrice: Decimal` as non-optional; `parseDecimal()` falls back to
   `Decimal(0)` on any missing value instead of leaving it `undefined`. The
   `pos.markPrice ? … : "?"` fallback in
   `src/components/shared/PositionsList.svelte:223` therefore never takes
   its "unknown" branch — it always renders `"0"`.
3. `src/services/bitunixWs.ts`'s `price`-channel fast-path handler
   (~lines 930-963) parses `data.ip` (index price) but discards `data.mp`
   entirely; `MarketData` in `src/stores/market.svelte.ts:25-45` has no
   `markPrice` field to hold it even if it were read. There is currently no
   place in the client where a real mark price for a symbol is stored.

## Cause

The position display was built against fields Bitunix's position endpoints
were assumed to carry, without checking the actual response schema. The one
transport that does carry mark price (the public ticker/price feed) was
never wired into position rendering.

## Fix

Full data-pipeline change, tracked as its own body of work rather than a
one-line patch — see
[`FEAT-0057`](../features/FEAT-0057-market-activity-panel-redesign.md) for
the complete plan (adding `MarketData.markPrice`, parsing `mp` in the WS
price-channel handler, and reading it per-symbol from `marketState` instead
of the account store when rendering positions).

## Acceptance criteria

- [ ] `MarketData` carries a live `markPrice` sourced from the WS `price`
      channel's `mp` field
- [ ] `PositionsList`/`PositionTooltip` read mark price from `marketState`,
      not from `accountState.positions[].markPrice`
- [ ] A position with no mark price yet (fresh WS `OPEN` event before the
      first ticker push) shows a clear "not yet available" state, never `"0"`
- [ ] A test reproduces the current always-zero behaviour and fails without
      the fix

## Links

- [`FEAT-0057`](../features/FEAT-0057-market-activity-panel-redesign.md)
- `docs/bitunix-api/05_position.md`, `08_websocket.md`, `04_market.md`
- `src/stores/account.svelte.ts`, `src/stores/market.svelte.ts`,
  `src/services/bitunixWs.ts`, `src/components/shared/PositionsList.svelte`
