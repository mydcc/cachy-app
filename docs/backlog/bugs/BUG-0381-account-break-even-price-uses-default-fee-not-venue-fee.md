---
id: BUG-0381
title: Account break-even price uses hardcoded DEFAULT_FEES, not venue fee
type: bug
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: []
assignee: claude
---

# BUG-0376 — Account break-even price uses hardcoded DEFAULT_FEES, not venue fee

## Symptom

When a position arrives via the account REST hydration or the WS
position channel, `breakEvenPrice` is computed with
`new Decimal(CONSTANTS.DEFAULT_FEES)` — a fixed 0.06% taker rate —
instead of the venue-reported maker/taker fee for that account.

For accounts on a VIP tier (lower fee), the displayed break-even price
is slightly too high, making the position look marginally less profitable
than it is. The figure is correct to within ~0.04% (the gap between the
default 0.06% and a typical VIP rate), but it is not the rate the user
actually pays.

## Evidence

**Derived.** Two call sites in `src/stores/account.svelte.ts`:

- Line 289-293: `calculateBreakEvenPrice(safeDecimal(...), new Decimal(CONSTANTS.DEFAULT_FEES), side)`
- Line 465-469: `calculateBreakEvenPrice(entryPrice, new Decimal(CONSTANTS.DEFAULT_FEES), side)`

Both hardcode `CONSTANTS.DEFAULT_FEES`. The `tradeState` store already
holds `remoteMakerFee` and `remoteTakerFee` (populated from the exchange
during account hydration), but `account.svelte.ts` does not read them.

## Cause

`account.svelte.ts` was written before the per-account fee model was
introduced (FEAT-0328 / BUG-0329). It correctly uses `CONSTANTS.DEFAULT_FEES`
as a safe default, but was never updated to prefer the remote fee when
available. The `breakEvenPrice` function accepts any fee rate as its
second argument, so swapping in the remote rate is a drop-in change.

## Fix

Replace `new Decimal(CONSTANTS.DEFAULT_FEES)` with the account's remote
taker fee when it is set, falling back to `CONSTANTS.DEFAULT_FEES`.

In `src/stores/account.svelte.ts`, read `tradeState.remoteTakerFee`
(or the account's stored fee rate) at both call sites (lines 291, 467).

```ts
const feeRate = tradeState.remoteTakerFee ?? new Decimal(CONSTANTS.DEFAULT_FEES);
breakEvenPrice: calculateBreakEvenPrice(entryPrice, feeRate, side),
```

## Acceptance criteria

- [ ] `breakEvenPrice` reflects `remoteTakerFee` when available.
- [ ] Falls back to `CONSTANTS.DEFAULT_FEES` when no remote fee is set.
- [ ] Existing tests pass; add a test covering the remote-fee path.
- [ ] `npm run check` green.

## Links

- `src/stores/account.svelte.ts:289-293` — breakEvenPrice in WS handler
- `src/stores/account.svelte.ts:465-469` — breakEvenPrice in REST hydration
- `src/stores/trade.svelte.ts:72-75` — remoteMakerFee / remoteTakerFee fields
- `src/lib/constants.ts:607` — DEFAULT_FEES constant
