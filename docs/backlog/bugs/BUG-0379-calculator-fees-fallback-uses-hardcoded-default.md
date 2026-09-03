---
id: BUG-0379
title: Calculator fee fallback uses hardcoded default instead of per-account remote fee
type: bug
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: calculator
data_class: none
adr: none
depends_on: []
assignee: claude
---

# BUG-0374 — Calculator fee fallback uses hardcoded default instead of per-account remote fee

## Symptom

When a user opens the calculator with a populated account on Bitunix/Bitget,
Cachy may display fee figures based on `CONSTANTS.DEFAULT_FEES` ("0.0600")
even though the exchange reported a different (often lower, VIP-tier) fee
rate for that account. The cost shown in the calculator can be higher than
the real cost, making the position size appear more conservative than it
is.

## Evidence

**Derived.** Two code paths disagree on which fee rate to use:

- `src/services/calculatorService.ts:422-424` —
  `fees: parseDecimal(currentTradeState.fees || CONSTANTS.DEFAULT_FEES)`
  falls back to the static constant whenever `currentTradeState.fees` is
  falsy.
- `src/stores/account.svelte.ts:291,467` — `breakEvenPrice` is always
  computed with `new Decimal(CONSTANTS.DEFAULT_FEES)`, ignoring any
  remote maker/taker fee stored in `tradeState.remoteMakerFee` /
  `tradeState.remoteTakerFee` (lines 72-75 of trade.svelte.ts).

The remote fee fields (`remoteMakerFee`, `remoteTakerFee`, `feeMode`)
already exist in `TradeStateSnapshot` and are populated from the
exchange, but the calculator never reads them.

## Cause

The calculator fee fallback chain does not consult the per-account fee
fields that the account hydration already fetched. `currentTradeState.fees`
is the user-editable manual override (nullable string); when it is empty,
the code falls back to a global constant instead of the exchange-reported
rate that applies to the active account.

## Fix

In `src/services/calculatorService.ts:422-424`, change the fallback so
that when `currentTradeState.fees` is empty the calculator prefers the
account's remote taker fee (the rate a market order actually pays) over
`CONSTANTS.DEFAULT_FEES`. For example:

```ts
fees: parseDecimal(
  currentTradeState.fees
    || (currentTradeState.remoteTakerFee?.toString())
    || CONSTANTS.DEFAULT_FEES,
),
```

Mirror the same logic in `src/stores/account.svelte.ts:291,467` for
`breakEvenPrice`, reading `tradeState.remoteTakerFee` when available.

Leave `CONSTANTS.DEFAULT_FEES` as the final fallback (no account data)
and preserve the user's manual override in `currentTradeState.fees`.

## Acceptance criteria

- [ ] `calculateAndDisplay()` uses the remote taker fee when the user
  has not manually overridden `fees` and the account has reported one.
- [ ] `breakEvenPrice` in account hydration reflects the remote fee, not
  only `CONSTANTS.DEFAULT_FEES`.
- [ ] Existing tests continue to pass; add a test that verifies the remote
  fee is preferred over the default when `currentTradeState.fees` is empty.
- [ ] `npm run check` green.

## Links

- `src/services/calculatorService.ts:422-424` — fee fallback in orchestrator
- `src/stores/account.svelte.ts:291,467` — breakEvenPrice using DEFAULT_FEES
- `src/stores/trade.svelte.ts:72-75` — remoteMakerFee / remoteTakerFee fields
- `src/lib/constants.ts:607` — DEFAULT_FEES constant
