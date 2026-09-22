---
id: BUG-0511
title: The margin check approves when it cannot measure, leaving an add with no ceiling at all while every other unverifiable input in the gate fails closed
type: bug
status: done
assignee: opencode
branch: fix/paket-d-limits-close
priority: P2
milestone: none
editions: [community, pro, private]
area: execution
data_class: none
adr: none
depends_on: []
---

# BUG-0511 — The one ceiling an add has is the one check that fails open

## Symptom

The gate states plainly what bounds an add (`src/services/orderGate.ts:874`):

> What *is* checked independently is available margin (`checkMargin`), which is
> the ceiling an add actually has.

When `checkMargin` cannot read a balance, it approves. So in the state where
the balance is missing, an add has no ceiling from any direction:

| control | status on an add with no readable balance |
|---|---|
| `checkMargin` | approves — nothing to compare (this item) |
| `checkPositionSize` | not run for adds (BUG-0508) |
| `checkLossPerTrade` | not run for adds (BUG-0510) |
| `checkOpenPositions` | not run for adds — correct, an add creates none |
| `checkSize` (add branch) | confirms the quantity matches the screen |

The last row is the whole remaining defence, and it is not a ceiling: it
verifies that the order says what the UI said, which is true of any size the
trader typed.

## Reachability

The obvious case is already covered and should not be claimed as this bug:
`checkAccountState` (`src/services/orderGate.ts:1309`) refuses an add whose
`accountStateAt` is undefined — age becomes `POSITIVE_INFINITY` — and the add
intent always carries `leverage` and `marginMode`, so that branch always runs.
An add fired before anything at all has loaded is refused as stale.

The reachable state is narrower and specific: **account state fresh, balance
absent.** Those are two independent reads. `tradeState.remoteAccountStateAt` is
stamped when the venue confirms leverage and margin mode;
`accountState.assets` is filled by a separate balance fetch
(`AccountManager.hydrateBalance`, `src/stores/account.svelte.ts:572`) and
separate WS pushes (`updateBalanceFromWs`, `:450`). A balance request that
fails or has not landed while the leverage read succeeded leaves exactly this
combination — fresh account state, no asset row.

`TradeService.addToPosition` (`src/services/tradeService.ts:1666`) then reads:

```ts
const availableMargin = accountState.assets.find(
    (a) => a.currency === "USDT",
)?.available;
```

and `checkMargin` (`src/services/orderGate.ts:1078`) opens with:

```ts
const available = displayed.availableMargin;
if (available === undefined) return null;
```

`undefined` from a missing asset row and `undefined` from a missing `available`
field on a present row are indistinguishable here, and both approve.

## Why this is a defect and not a documented trade-off

The gate holds a stated standard for unverifiable inputs, and applies it
everywhere else. `checkSize`, open branch:

> An unverifiable size is not a verified size.

`checkSize`, add branch, on a missing `addQuantity`:

> the same standard the `open` branch holds itself to

`rmsService` has a dedicated primitive for exactly this shape —
`unmeasurable(field)` — returned whenever a limit is configured and the order
carries nothing to measure it against. `checkMargin` is the outlier: it treats
an unmeasurable ceiling as an absent one.

The asymmetry is defensible for an `open`, where `checkSize` derives the size
independently from account size, risk and stop distance, so a skipped margin
check still leaves a ceiling standing. On an add there is no second derivation
— which is precisely what the gate's own comment says.

## Acceptance criteria

- `checkMargin` distinguishes "no limit to apply" from "cannot measure the
  limit". For `kind: "add"`, a missing `availableMargin` is a refusal, not an
  approval, and the refusal names the field so the UI can say *balance not
  loaded* rather than *insufficient margin*.
- `open` keeps its current behaviour, where `checkSize` provides the
  independent ceiling — changing it would refuse ordinary opens on a slow
  balance read for no gain.
- The refusal is recoverable by loading the balance, and the UI says so; a
  trader who cannot add because a read failed needs the cause, not a generic
  refusal.
- `checked` keeps recording `availableMargin` honestly — a refusal for
  unmeasurability is a decision and belongs in the audit trail, which today it
  never reaches because the early return precedes the `checked.push`.
- Tests:
  - an add with fresh account state and no USDT asset row is refused;
  - an add with an asset row whose `available` is undefined is refused;
  - an add with a readable balance behaves as today;
  - an `open` with no readable balance is still approved.

## Out of scope

- The USDT assumption itself. `fetchBitunixBalance`
  (`src/utils/server/venues/bitunix.ts:608`) filters the venue's balance
  response to USDT at the boundary, so the whole balance pipeline is
  single-asset by construction. Whether Cachy should support a non-USDT
  settlement asset is a feature question, not this refusal's.
- BUG-0508 and BUG-0510, which restore the two ceilings that are absent
  independently of whether the balance loaded.
