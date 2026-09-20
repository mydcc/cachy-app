---
id: BUG-0510
title: Scaling in never measures what the add does to the risk under the position's resting stop, although the new average entry is computed one line earlier
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: execution
data_class: none
adr: none
depends_on: [BUG-0502, BUG-0292]
---

# BUG-0510 — The add moves both sides of the risk equation and reports neither

## Symptom

A trader is long 1 ETH at 3,000 with a stop at 2,940. Risk: 60 USDT, inside
their 100 USDT loss-per-trade limit.

The position dips. They add 2 ETH at 2,950. Cachy shows them the new average
entry — 2,966.67 — and tells them the entry improved.

It does not tell them their risk is now 80 USDT. Add another 2 ETH and it is
past the limit they configured, and still nothing says so. The stop has not
moved a tick; what moved is the size standing behind it and the distance from
the new average entry to it. Both changed, in the same order, and neither was
measured.

The trader was told the truth about the entry and nothing about what the entry
was for. An average entry is not a number anyone wants for its own sake — it is
the number a stop distance is measured from.

## Cause

Three layers each decline the measurement, each for a reason that is about the
**intent** rather than about the data.

**The risk-limit layer.** `checkLimits` (`src/services/rmsService.ts:263`)
sends an add to `checkDailyLoss` and nothing else:

> `checkPositionSize` and `checkLossPerTrade` measure a stop distance an add
> does not carry

**The gate.** `checkSize`'s add branch (`src/services/orderGate.ts:874`):

> An add carries no new stop, so the risk formula below has nothing to divide
> by, and feeding it invented inputs would make the gate agree with a fiction.

**The intent.** Both statements are accurate about
`TradeService.addToPosition` (`src/services/tradeService.ts:1616`): its
`displayed` block carries `entryPrice`, `positionAmount`, `leverage`,
`marginMode`, `availableMargin` — and no `stopLossPrice`.

But "the add intent does not carry a stop" is a fact about how the intent is
built, not about whether the stop is knowable. It is: `tpSlState.plansFor`
(`src/stores/tpsl.svelte.ts:112`) and `hasPlansFor` (`:123`) already serve
exactly this lookup, and the post-trade protection check already uses it.
`addToPosition` reads `marketState`, `accountState` and `tradeState` already —
the store is in reach.

"Invented inputs" would indeed be a fiction. A resting stop read from the store
is not an invented input; it is the same fact the protection check treats as
authoritative.

## Why the preview stops short too

`previewAdd` (`src/lib/calculators/addToPosition.ts`) returns
`resultingEntryPrice`, `entryShift` and `worsensEntry`. It deliberately does
**not** return a liquidation price, and the reasoning in that module is sound:
the available models are isolated-margin approximations that ignore cross
margin and the venue's tiered maintenance-margin table, and a liquidation price
that is close but wrong is a hazard.

That reasoning does not extend to risk-under-the-stop, and the difference is
the whole point:

| | liquidation price | risk under the resting stop |
|---|---|---|
| depends on the venue's margin model | yes | no |
| depends on other positions / wallet | yes | no |
| inputs Cachy already holds exactly | no | yes — stop price, size, entry |

Risk under the stop is `|resultingEntryPrice − stopPrice| × resultingAmount`.
Every term is a fact Cachy holds or has just computed. Declining it under the
liquidation-price rationale applies a caution earned by one number to a
different number that did not earn it.

## Why this is blocked, not merely unbuilt

The lookup this needs is the one two open items say is not yet trustworthy:

- **BUG-0502** — `plansFor` matches any stop on the symbol, ignoring side,
  position and price. Sizing a risk figure off the wrong side's stop is worse
  than showing none.
- **BUG-0292** — Bitunix TP/SL rows carry no `planType`, so `plansFor` never
  groups them at all on that venue.

Both must land first, or this feature reads a stop that is not the position's
stop and reports a confident wrong risk — the precise failure `addToPosition.ts`
refuses to commit with the liquidation price.

## Acceptance criteria

- `previewAdd` (or a sibling in the same module) returns the risk the resulting
  position carries under a supplied stop price, and `null` when no stop is
  known — never a zero that reads as "no risk".
- `AddToPositionModal` shows that figure beside the resulting entry, both in
  quote currency and as a percentage of account size, and states plainly when
  no stop is attached to the position — an unprotected add is information, not
  an empty field.
- `TradeService.addToPosition` puts the position's resting stop price on the
  add intent's `displayed` when one is known, alongside `accountSize`
  (see BUG-0508).
- `checkLossPerTrade` measures an add when a stop is present on the intent,
  against the **resulting** position, and returns `unmeasurable` rather than
  approving when a limit is configured and no stop is known — the same
  fail-closed posture the other limits take.
- An add to a position with no stop at all is not silently exempt from a
  configured loss-per-trade limit.
- Tests:
  - an add that pushes the resulting position's stop risk past
    `maxLossPerTradeUsdt` is refused;
  - an add that improves the average entry enough to *reduce* risk is allowed;
  - an add on a position with no resting stop, with a limit configured, is
    refused as `unmeasurable` rather than approved;
  - the preview reports `null` risk, and the modal says so, when no stop exists.

## Out of scope

- Showing a liquidation price in the add preview. The reasoning against it in
  `addToPosition.ts` stands and this item does not reopen it.
- Automatically moving the stop when a position is added to. Re-sizing someone
  else's stop is a decision, not a calculation.
- `maxPositionSizeUsdt` on adds — BUG-0508, which needs no stop and should not
  wait for this item's dependencies.
