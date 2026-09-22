---
id: BUG-0489
title: A bot sizes and places its stop from the anchor candle's close while submitting a market order at the current price
type: bug
status: done
priority: P2
assignee: opencode
branch: fix/BUG-0489-bot-live-price-sizing
milestone: none
editions: [community, pro, private]
area: execution
data_class: none
adr: none
depends_on: []
---

# BUG-0489 — A bot sizes and places its stop from the anchor candle's close while submitting a market order at the current price

## Symptom

A bot fires on a candle close and submits a **market** order. Its quantity, its stop price
and the `riskPercentage` it declares are all computed from the *close of the candle it
fired on* — a price that is already in the past when the order is sent, and further in the
past the longer the trigger timeframe is.

On a 4h bot in a fast market the fill can be well away from that close. The position is then
larger or smaller than the risk the trader asked for, and the stop sits at a distance from
the fill that is not the distance the document specifies. A `percent_risk` bot — the sizing
this whole calculator exists for — is the one most affected, because the entry price appears
twice in its formula.

## Evidence

**Derived.**

`src/services/alertEngine/botOrders.ts`:

```ts
const entryPrice = env.closeAt(firing.rule.symbol, firing.rule.trigger_timeframe, firing.anchorMs);
...
const stopPrice = stopPriceFor(entryPrice, order.side, order.stop);
const quantity = quantityFor(order, equity, entryPrice, stopPrice);
...
await env.place({
  ...
  entryType: "market",
  qty: quantity,
  entryPrice,
  stopLossPrice: stopPrice,
  riskPercentage: riskPercentageFor(quantity, equity, entryPrice, stopPrice),
});
```

`closeAtAnchor` looks the candle up **by open time** and returns its `close`. The comment
above it is explicit that this is deliberate — "on a busy series the newest candle may no
longer be the one that fired" — and that reasoning is right for *identifying* the candle.
It does not follow that the candle's close is the right reference for sizing an order that
executes now.

`entryType: "market"` means the fill price is whatever the venue gives. So `entryPrice`
here is a claim about the past that the payload presents as the entry.

Related but distinct: `StopDistance` is a distance precisely so that "the stop the trader
described and the stop that reaches the venue are the same claim"
(`technicals-wasm/src/rule/consequence.rs`). Resolving that distance against a stale
reference is what breaks the claim — the schema did its half correctly.

Contained today by paper trading (`env.paperEnabled()`), which is this item's scope bound,
not its safety argument.

## Cause

One price is doing two jobs: identifying which candle the verdict belongs to, and pricing
the order. The first needs the anchor's close; the second needs the current market price.

## Fix

Separate them. Keep `closeAtAnchor` for what it is good at — proving the firing's candle is
still known, which is also the guard that produces `no-entry-price` — and take the price the
order is sized and stopped against from the live last price at submission time.

If the live price is unavailable, refuse rather than fall back to the stale close: a bot
that does nothing and says so is the outcome this engine prefers, and `BotOrderRefusal`
already has the channel for it.

Worth deciding in the same item: whether a fired bot should refuse outright when the market
has moved more than some distance from the anchor close since the firing. A fill far from
the level the strategy was written against is not the trade the document describes.

Leave alone: `quantityFor`, `stopPriceFor` and `riskPercentageFor`. The arithmetic is
correct and exhaustively tested; only its input is wrong.

## Acceptance criteria

- [ ] A test fires a `percent_risk` bot with the live price moved away from the anchor close
      and asserts the submitted quantity and stop are derived from the live price — failing
      before the fix
- [ ] `riskPercentage` in the payload matches the quantity actually submitted, so the gate's
      re-derivation (FEAT-0011) still agrees
- [ ] A missing live price refuses through `BotOrderRefusal` and submits nothing
- [ ] `closeAtAnchor` still refuses a firing whose candle is no longer held
- [ ] The existing sizing tests in `botOrders.test.ts` pass unchanged

## Links

- `src/services/alertEngine/botOrders.ts` — `submitBotOrder`, `closeAtAnchor`
- `technicals-wasm/src/rule/consequence.rs` — why `StopDistance` is a distance
- [`FEAT-0488`](../features/FEAT-0488-bot-order-submission-guard.md) — the other half of the submission story
- [`BUG-0483`](BUG-0483-backfill-anchor-names-the-wrong-candle.md) — why the anchor can be wrong in the first place
