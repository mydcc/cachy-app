---
id: BUG-0505
title: Every quantity sent on a modify leaves the gate unverified, including the stop quantity that decides how much of a position is actually protected
type: bug
status: done
branch: fix/gate-kern-paket-c
priority: P1
milestone: none
editions: [community, pro, private]
area: execution
data_class: none
adr: none
depends_on: []
assignee: opencode
---

# BUG-0505 — A modify's quantity is never compared against anything

## Symptom

A trader places a partial stop-loss on an open position — a stop that closes
only part of it — or edits the quantity of an existing TP/SL plan.

The price they typed is verified against the outgoing payload before the
request leaves. The quantity is not. There is no comparison against what the
screen showed, no bound against the position it protects, no venue minimum, no
maximum, no step-size rule.

A stop quantity that is smaller than intended protects less of the position
than the trader believes. The panel shows a stop; the remainder runs past it
unprotected. Nothing in the verdict distinguishes this from a fully verified
order — the audit trail simply has no entry for the field.

## Evidence

**Derived, from reading the code.** `verify` performs exactly one size check,
`checkSize` (`src/services/orderGate.ts:824`). On a modify it cannot run, and
on the TP/SL payloads it could not read the field even if it did.

**The check bails before it starts.** `src/services/orderGate.ts:1005`:

```typescript
const { accountSize, riskPercentage, entryPrice, stopLossPrice } = displayed;
if (
    accountSize === undefined ||
    riskPercentage === undefined ||
    entryPrice === undefined ||
    stopLossPrice === undefined
) {
    // Not enough displayed state to derive size a second way. For an
    // open that is itself disqualifying — an unverifiable size is not
    // a verified size.
    if (kind === "open") {
        checked.push("qty");
        return missing("qty.inputs");
    }
    return null;
}
```

For an `open`, a missing input is disqualifying. For a `modify` it is a pass.

**No modify intent can get past it.** `accountSize` reaches `displayed` at
exactly three production sites — `PlaceOrderPanel.svelte:272`,
`orderPlacementService.ts:179` and `alertEngine/botOrders.ts:238` — and all
three build an `open` or an `add`. None of the four modify constructors in
`tradeService.ts` (`modifyOrder:1907`, `modifyTpSlOrder:2086`,
`placePositionTpSl:2149`, `placeTpSlOrder:2228`) supplies it. The branch below
the guard is unreachable on a modify, so the `return null` is not an edge case
— it is the whole path.

**`checkVolumeLimits` goes with it.** It is called only from the `add` branch
and from the end of the `open`/`modify` branch, both below the guard. A modify
is therefore also exempt from `minTradeVolume`, `maxMarketOrderVolume` and
`maxLimitOrderVolume` (`orderGate.ts:1127`).

**The TP/SL quantities have no reader at all.** `checkSize` takes
`toDecimal(payload.qty)` — a flat field. `placeTpSlOrder` nests both
quantities one level down (`src/services/tradeService.ts:2211`, `:2220`):

```typescript
wire.tpQty = formatApiNum(params.takeProfit.qty);
...
wire.slQty = formatApiNum(params.stopLoss.qty);
```

and sends them as `payload.params`, while `displayed` carries only prices:

```typescript
displayed: {
    symbol: params.symbol,
    positionId: params.positionId,
    takeProfits: params.takeProfit ? [params.takeProfit.price] : undefined,
    stopLossPrice: params.stopLoss?.price,
},
priceFields: {
    takeProfit: "params.tpPrice",
    stopLoss: "params.slPrice",
},
```

The nesting is already solved — for prices. `priceFields` maps the payload path
so `checkPrices` can find it. There is no `qtyFields` counterpart, so no
quantity is reachable even in principle.

`modifyTpSlOrder` repeats the shape exactly (`tradeService.ts:2077`, `:2081`):
`wire.tpQty` / `wire.slQty` on the wire, prices mapped through `priceFields`,
no quantity on `displayed`.

`modifyOrder` is the third site and uses the flat field
(`tradeService.ts:1880`):

```typescript
const qty = params.qty !== undefined ? formatApiNum(params.qty) : liveOrder.amount;
```

Its own comment (`:1904`) states the purpose of the displayed side: comparing
the formatted payload back against the raw request is "what catches a
serialisation defect". `params.qty` goes through the same `formatApiNum` as the
prices that *are* compared, and is the one number left out of `displayed`.

**Nothing records the omission.** `checked` gains no `qty` entry and no marker
saying the field was unverifiable. An approved verdict on a modify is
indistinguishable, in its own audit trail, from one where the size was checked
and matched.

FEAT-0011 lists `modifyOrder` and `modifyTpSlOrder` among the verbs the gate
covers (`FEAT-0011:140`). The coverage is real for identity and prices, and
absent for size.

## Cause

`checkSize` re-derives an open's size from account size, risk and stop
distance. A TP/SL quantity is not derivable that way — there is no risk formula
that produces "close 40 % of this position" — so the modify branch was written
to step aside when the derivation inputs are absent.

The reasoning is right about the *derivation* and was applied to the *whole*
check. Most of what `checkSize` does needs no derivation at all: comparing the
payload against the number the screen showed, bounding it by the position,
holding it to the venue's minimum, maximum and step. The `add` branch
(FEAT-0334) does precisely that and is the working model — it verifies against
`displayed.addQuantity` and says so in its own comment, because "there is no
second, independent way to derive it".

An `add` treats an absent displayed quantity as disqualifying. A modify treats
it as nothing to do. That asymmetry is the defect.

## Fix

Give a modify the same treatment the `add` branch already gets.

1. **Carry the quantity on `displayed`.** Every modify constructor that sends
   one supplies it: `modifyOrder`'s `params.qty`, and both TP/SL legs'
   quantities.
2. **Add a `qtyFields` map for nested payloads**, mirroring `priceFields`. The
   mechanism exists and is proven on the price side; the quantity side needs
   the same three lines.
3. **Compare, then bound.** Match the payload quantity against the displayed
   one the way the `add` branch does, then run `checkVolumeLimits` and the
   step-size rule on it. A TP/SL quantity should additionally be bounded by the
   position it protects, the way a reduce is bounded by `positionAmount`.
4. **Make an absent displayed quantity disqualifying.** A modify that sends a
   quantity with no displayed counterpart must refuse with
   `missing("qty.inputs")`, exactly as an open does. Without this, the next
   payload that grows a quantity field inherits the same silence.
5. **Record it in `checked`**, so an approved modify says which fields were
   compared.

The derivation stays out of it: a modify's quantity is verified against what
the trader was shown, never re-derived from a risk formula that does not
describe it.

Which TP/SL controls can send a partial quantity today, and how often a partial
stop is used in practice, this analysis did not establish — the wire carries
the field on every call, so the gap is in the path regardless of how often it
is exercised.

## Acceptance criteria

- [ ] A test sends a `modify` whose payload quantity differs from the displayed
      quantity and asserts the order is refused
- [ ] The test fails without the fix
- [ ] A TP/SL quantity nested under `params.slQty` is read and compared, proven
      by a test that mutates only that field
- [ ] A modify quantity below `minTradeVolume` or above the applicable maximum
      is refused
- [ ] A modify that sends a quantity with no displayed counterpart is refused
      with `missing("qty.inputs")`
- [ ] `checked` contains the quantity field on an approved modify
- [ ] Modifies that send no quantity at all are still approved unchanged

## Links

- FEAT-0011 — the gate scope that lists these verbs as covered
- FEAT-0334 — the `add` branch, the working model for a quantity that cannot be
  re-derived
- BUG-0502 — the other half of the same promise: a stop reported as protection
  that protects less than the trader believes
- BUG-0501 — the same shape in the size guards: an absent input degrading to
  "no check" instead of "no order"
