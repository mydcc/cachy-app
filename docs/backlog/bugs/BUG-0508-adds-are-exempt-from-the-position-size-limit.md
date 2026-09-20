---
id: BUG-0508
title: An add is exempt from the position-size limit, so scaling in grows a position past a cap that is only ever measured against the opening order
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: execution
data_class: none
adr: none
depends_on: []
---

# BUG-0508 — The notional cap stops the first order and no order after it

## Symptom

A trader sets `maxPositionSizeUsdt` to 5,000. They open a position worth 5,000
— allowed, exactly at the cap. They then add to it. And add again. Each add is
waved through.

There is no point at which Cachy says no. The position reaches 15,000 USDT of
notional exposure under a limit that reads "max position size 5,000", and the
limit was never wrong about a single order: every individual order it saw was
inside the cap. It simply never saw the position.

The limit is not advisory. It sits in `riskLimits` beside the kill switch and
the daily-loss limit, it is enforced at the gate where orders leave, and it is
the control a trader configures precisely so that a position cannot grow past a
size they decided on while calm.

## Cause

`checkLimits` routes an add to exactly one limit and skips the rest
(`src/services/rmsService.ts:263`):

```ts
if (intent.kind === "add") return this.checkDailyLoss();
```

The comment above that line states the reasoning:

> The size-based limits are deliberately not applied: `checkPositionSize` and
> `checkLossPerTrade` measure a stop distance an add does not carry, and
> `checkOpenPositions` counts positions an add does not create.

That justification is correct for two of the three and false for the third.

`checkPositionSize` (`src/services/rmsService.ts:331`) does not measure a stop
distance. It measures notional, and it gets it from `notionalOf`
(`src/services/rmsService.ts:375`):

```ts
const qty = toDecimal(intent.payload.qty);
const price = intent.displayed.entryPrice ?? toDecimal(intent.payload.price);
return qty.times(price);
```

Quantity and price — nothing else. The add intent built by
`TradeService.addToPosition` (`src/services/tradeService.ts:1616`) carries both:
`payload.qty` is the add quantity, and `displayed.entryPrice` is the fill-price
estimate (the limit price, else the mark, else the entry). The absolute branch
of the limit is fully measurable on an add today. It is skipped under a reason
that belongs to its neighbours.

Three limits were grouped under one justification, and the group was written
for the two members it fit.

### What the gate checks instead

Nothing else closes the gap. `checkSize`'s add branch
(`src/services/orderGate.ts:874`) verifies the quantity against
`displayed.addQuantity`, the step size, and the venue's volume limits — it
confirms the order matches the screen, not that the result is within the
trader's risk rules. The gate's own note names the only independent ceiling an
add has:

> What *is* checked independently is available margin (`checkMargin`), which is
> the ceiling an add actually has.

Available margin is the venue's limit, not the trader's. On 20x leverage a
5,000 USDT cap and a 1,000 USDT free balance are four orders of magnitude apart
in what they permit.

### Two defects, one line apart

1. **The absolute cap is skipped although it is measurable.**
   `maxPositionSizeUsdt` needs `qty × price`, and the add carries both.
2. **The percentage cap could not run even if it were reached.**
   `checkPositionSize` reads `intent.displayed.accountSize` for
   `maxPositionSizePercent`, and the add intent does not carry `accountSize` —
   the field is absent from the `displayed` block in
   `TradeService.addToPosition`. Wiring the limit without also supplying
   `accountSize` converts the percentage cap from "not applied" into
   `unmeasurable`, which fails closed and refuses every add on an account with
   a percentage cap configured. Both halves belong in the same change.

### The measurement is also the wrong quantity

Even once `checkPositionSize` runs on an add, `notionalOf` measures the order,
not the position. For an `open` those are the same thing. For an add they are
not: the question the cap answers is how large the position becomes, which is
`(positionAmount + addQuantity) × price`. `displayed.positionAmount` is already
on the add intent — the fix has the number it needs, but taking `notionalOf`
unchanged would cap each add individually and still let ten of them through.

## Acceptance criteria

- `checkLimits` applies `checkPositionSize` to `kind: "add"`, not only
  `checkDailyLoss`.
- The notional measured for an add is the **resulting** position
  (`positionAmount + addQuantity`, priced at `displayed.entryPrice`), not the
  add leg alone. An `open` keeps measuring the order, because for an open the
  two are identical.
- `TradeService.addToPosition` supplies `accountSize` on the add intent, so
  `maxPositionSizePercent` is measurable rather than `unmeasurable`.
- The comment in `checkLimits` is corrected: it currently states a reason for
  `checkPositionSize` that does not hold, and a future reader would re-derive
  the same wrong conclusion from it.
- Tests in `rmsService_riskLimits.test.ts`:
  - an add that would take the resulting position past `maxPositionSizeUsdt` is
    refused, with the resulting notional in the refusal values;
  - an add that stays inside the cap is allowed;
  - repeated adds each inside the cap but cumulatively past it are refused at
    the one that crosses — the regression this item exists for;
  - an add on an account with `maxPositionSizePercent` set is measured, not
    refused as `unmeasurable`.

## Out of scope

- `checkLossPerTrade` on an add. The stop distance genuinely is absent from the
  add intent, and sourcing it from the position's resting stop is its own
  change with its own hazards — tracked separately.
- `checkOpenPositions` on an add. An add does not create a position; skipping
  it is correct.
- Any change to what `open` measures. The cap is right for an opening order
  and must stay unchanged.
