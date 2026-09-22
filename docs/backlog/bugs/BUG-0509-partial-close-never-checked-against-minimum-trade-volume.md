---
id: BUG-0509
title: A partial close is never measured against the venue's minimum trade volume, and the percentage slider routinely produces one below it
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

# BUG-0509 — The reduce path is the one path with no volume check

## Symptom

A trader holds 0.4 ETH and wants to take a little off the table. They drag the
partial-close slider to 5 %. Cachy shows 0.02 ETH, the gate approves it, and
the exchange refuses the order because its minimum trade volume is 0.1.

The trader was reducing risk — usually the moment they are least able to spend
attention on an error toast. They get a venue rejection instead of the one
answer that would have helped: *below the minimum, close more or close all*.

This is not an edge case the UI has to be coaxed into. Cachy's own control
produces it: `quantityFromPercent` floors a rounded-to-zero quantity at one
**step**, and a step is routinely far smaller than the venue's minimum trade
volume (0.001 vs 0.01 is an ordinary pairing). Every small percentage of a
small position lands in the gap.

`partialClose.ts` names this exact failure mode in its own module note, about
the neighbouring rule:

> a control that routinely produces refused orders is a broken control, not a
> safe one

That standard is applied to rounding direction and not to volume.

## Cause

Two independent halves, either of which alone would be enough.

**1. The reduce branch returns before the check.** `checkSize`
(`src/services/orderGate.ts:874`) ends each branch differently:

- `open` / `modify` → `return this.checkVolumeLimits(intent, checked, payloadQty);`
- `add` → `return this.checkVolumeLimits(intent, checked, payloadQty);`
- `reduce` → `return null;`

`reduce` is the only branch that does not reach `checkVolumeLimits`
(`src/services/orderGate.ts:1127`), which is where `minTradeVolume`,
`maxMarketOrderVolume` and `maxLimitOrderVolume` are enforced. Nothing in the
reduce branch's comments claims this is deliberate — the branch documents its
step-size rule and its full-close exemption at length, and says nothing about
volume.

**2. The reduce intent carries nothing to check.** `TradeService.closePosition`
(`src/services/tradeService.ts:1738`) reads the instrument metadata and takes
exactly one field out of it:

```ts
const meta = marketState?.symbolMeta?.[symbol] ?? ...;
const stepSize = meta?.basePrecision !== undefined
    ? new Decimal(10).pow(-meta.basePrecision)
    : undefined;
```

`displayed` then carries `positionAmount`, `fullClose`, `stepSize`,
`positionId` — and no volume fields. The same `meta` object holds
`minTradeVolume`, `maxLimitOrderVolume` and `maxMarketOrderVolume`;
`TradeService.addToPosition` (`src/services/tradeService.ts:1616`) pulls all
four out of it, twenty lines away in the same class. So even after fixing half
one, the check would find `undefined` and pass.

## Why the fix is not "check volume on every reduce"

A **full** close must never be refused for volume, for the same reason it is
already exempt from the step rule: a position can hold a size below the current
minimum — after a partial liquidation, or when the venue changed the minimum —
and the only order that closes such a position is one for exactly that size.
Refusing it locks the trader inside their own position, which is worse than the
failure being prevented.

The **maximum** is a different question again, and not this item's: a position
larger than `maxMarketOrderVolume` cannot be flash-closed in one order, and the
useful answer there is splitting the order, not refusing it. Refusing a close
never closes anything.

So the rule this item asks for is narrow: **partial reduces are checked against
the minimum**, full closes are exempt, and the maximum stays out of the reduce
path until order splitting exists to make a refusal actionable.

## Acceptance criteria

- `TradeService.closePosition` puts `minTradeVolume` on the reduce intent's
  `displayed`, read from the same `meta` it already reads `basePrecision` from.
- `checkSize`'s reduce branch checks the minimum for a partial reduce
  (`displayed.fullClose !== true`), mirroring the shape of the step-size rule
  directly above it, and leaves a full close exempt.
- The exemption is stated in a comment, so the next reader does not "fix" it.
- `quantityFromPercent` in `partialClose.ts` floors at the venue minimum rather
  than at one step when a minimum is known, so the producer stops generating
  quantities the gate would now refuse. Without this half the change converts a
  venue rejection into a Cachy rejection and the slider is still broken.
- The partial-close UI states the floor it applied, rather than silently
  snapping the percentage.
- Tests:
  - a partial reduce below `minTradeVolume` is refused by the gate;
  - a full close below `minTradeVolume` is approved;
  - `quantityFromPercent` with a minimum coarser than the step returns the
    minimum, and never more than the position;
  - a partial reduce on an instrument whose meta has not loaded is refused as
    unmeasurable rather than approved (decision #3553, BUG-0501 alignment:
    an unmeasurable size is not a verified size; full closes stay exempt).

## Out of scope

- Maximum order volume on the reduce path, and order splitting for positions
  larger than a single market order can close. Worth its own item.
- The `add` and `open` paths, which already check both bounds.
- BUG-0506's tolerance question, which concerns the size *comparison* rather
  than the venue's bounds.
