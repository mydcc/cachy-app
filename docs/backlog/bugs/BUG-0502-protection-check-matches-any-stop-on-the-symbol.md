---
id: BUG-0502
title: The post-placement protection check accepts any stop on the symbol, so a pre-existing plan reports a new position as protected
type: bug
status: done
branch: fix/bug-0502-protection-check
priority: P0
milestone: none
editions: [community, pro, private]
area: execution
data_class: none
adr: none
depends_on: []
assignee: opencode
---

# BUG-0502 — A pre-existing stop reports the new position as protected

## Symptom

A trader who already holds a position on a symbol places a second entry on that
same symbol — adding to the position, or opening the other side in hedge mode —
with a new stop-loss price.

The entry is placed. The new stop is not. The panel reports the order as placed
and protected, with no warning, because an older stop plan on that symbol was
found and accepted as proof.

The position is now larger than the stop was sized for, or sits at a stop price
the trader replaced and believes is gone. Nothing in the result distinguishes
this from a correctly protected entry.

The same hole covers a stop that *was* placed but landed at the wrong price:
only existence is ever checked, never the price.

## Evidence

**Derived, from reading the code.** The last check between "position opened" and
"trader told they are protected" asks a question about the symbol, not about the
order.

`confirmProtection` decides protection from two booleans —
`src/services/orderPlacementService.ts:242`:

```typescript
const plans = await this.readPlans(plan.symbol);
const haveStop = plans.loss !== undefined;
const haveTarget = plans.profit !== undefined;

const stopSettled = !want.wantsStop || haveStop;
const targetSettled = !want.wantsTarget || haveTarget;

if (stopSettled && targetSettled) {
    return {
        stopLoss: want.wantsStop ? (settled as ProtectionState) : "none",
        takeProfit: want.wantsTarget ? (settled as ProtectionState) : "none",
        unprotected: false,
    };
}
```

`readPlans` re-reads the venue, bypassing the cache, and hands straight to
`plansFor` — `src/services/orderPlacementService.ts:303`:

```typescript
private async readPlans(symbol: string) {
    tpSlState.invalidate();
    await tpSlState.ensureFresh();
    return tpSlState.plansFor(symbol);
}
```

The freshness is real; the scoping is not. `plansFor` filters on the symbol and
nothing else, and keeps the **first** plan of each type it happens to encounter
— `src/stores/tpsl.svelte.ts:112`:

```typescript
public plansFor(symbol: string): SymbolPlans {
    const plans: SymbolPlans = {};
    for (const order of this._orders) {
        if (order.symbol !== symbol) continue;
        const type = planTypeOf(order);
        if (type === "PROFIT" && !plans.profit) plans.profit = order;
        if (type === "LOSS" && !plans.loss) plans.loss = order;
    }
    return plans;
}
```

Four things this filter cannot see, each of which is the difference between a
verification and a coincidence:

- **Which side the plan belongs to.** In hedge mode a short's stop satisfies a
  long entry's protection check.
- **Which position the plan belongs to.** A plan left over from the earlier
  position on that symbol counts for the new one.
- **What price the plan carries.** `plan.stopLossPrice` is never compared
  against `plans.loss`. A stop that landed at the wrong level passes.
- **When the plan was created.** There is no "this appeared as a result of my
  request" test, which is the only thing that would make the check causal.

`_orders` ordering decides which plan wins the `!plans.loss` race, so on a
symbol with several plans the one that answers for the new entry is arbitrary.

The retry path inherits the same blindness —
`src/services/orderPlacementService.ts:120` and `:128` give it
`STOP_RETRY_ATTEMPTS = 2` and `STOP_RETRY_DELAY_MS = 1200`. Those retries only
ever run when *no* loss plan exists on the symbol at all. With a stale one
present, the first pass returns success and the retry is never reached.

Everything else on this path is careful. The `unprotected` flag, its
`orderEntry.errors.unprotected` key and the comment that a caller "cannot render
it as a success" all show the failure case was designed deliberately. The defect
is that the condition guarding it can be satisfied by state the request did not
produce.

## Cause

`plansFor` was written for a card that asks "show me what is on this symbol" —
its own doc comment says "no plans" and "not loaded yet" look the same, and both
mean "show nothing". That is right for rendering. `confirmProtection` reuses it
to answer a different question — "did my request take effect" — which needs
identity, not existence.

The gate already enforces identity in the other direction: `checkPrices`
compares every displayed price against the payload before the request leaves.
That discipline stops at the network boundary. Nothing compares the resulting
venue state against the intent that asked for it.

## Fix

Make the check causal — it must be able to fail when the new stop is absent even
though an old one is present.

1. **Compare the price, not just the presence.** `plans.loss` must match
   `plan.stopLossPrice` within the venue's tick tolerance before it counts as
   this entry's stop. This alone closes the stale-plan and wrong-price cases and
   is the smallest correct step.
2. **Scope the lookup to the position.** Give `plansFor` a side/position
   parameter — or add a sibling used only by the placement path — so a hedge
   position's opposite side can never answer. Leave the existing symbol-scoped
   call for the cards that want it.
3. **Compare against a before-image.** Read the symbol's plans *before* placing
   the entry and require the confirming plan to be one that was not there
   before, or to differ from the one that was. This is what makes the check
   prove causation rather than correlation.
4. **Apply the same three to `haveTarget`.** A target is less urgent by design —
   the retry comment says so — but it is reported to the trader with the same
   confidence and is wrong in the same way.

Do not weaken the existing `unprotected` result or its retry budget; both are
correct. This changes only which inputs are allowed to declare success.

Whether Bitunix silently ignores an attached stop when a position plan already
exists, or replaces it, cannot be seen from the code — but it no longer blocks
this item, because both outcomes leave the check unsound:

- **Bitunix** (`tpSlAtEntry: true`,
  `src/services/exchange/bitunixCapabilities.ts`): `placeEntryGroup` writes the
  new stop onto the same place-order request (`slPrice`), so the new price is
  always transmitted (`src/services/orderPlacementService.ts:175-196`). If the
  venue replaces the old position stop, the check passes — for the wrong reason,
  since the price is never compared. If the venue stacks the new stop next to
  the old one, `plansFor` keeps whichever plan it encounters first and the
  confirming plan is arbitrary. Either way the reported `"attached"` describes
  transmission, not which plan protects the position.
- **Bitget** (`tpSlAtEntry: false`,
  `src/services/exchange/bitgetCapabilities.ts`): `attach` is false, so the
  `stopLoss` parameter is `undefined` and nothing is transmitted; the placement
  path contains no separate stop step (established in BUG-0503). Whenever an old
  plan exists on the symbol, the stale-plan case fires with certainty, and the
  reported `"placed"` describes a stop nobody sent.

The remaining venue-internal question (replace vs. stack on Bitunix) changes how
often the stale-plan case fires in practice, not whether the check is sound.

## Financial impact

Configured risk is `accountSize × riskPercentage = R`. Every sub-case below
spends more than R while reporting the position as capped at R:

- **Add case:** a second entry of equal size doubles the position while the
  confirming stop was sized and priced for the first entry. An adverse move to
  the old stop costs up to ~2R; if the old stop is wider than the intended new
  one, more.
- **Wrong-price case:** the stop exists but at a level the trader replaced and
  believes is gone. The loss equals full position × distance(entry, actual stop)
  and is unbounded by anything the trader configured.
- **Hedge wrong-side case:** one side reports protected while its position has
  no stop at all. Exposure is the full side notional into the adverse move,
  bounded only by liquidation — whose projection is itself wrong on cross
  margin (BUG-0504).
- **Label effect:** `unprotected: false` with `"attached"`/`"placed"` lets every
  downstream consumer (journal, risk display, trader trust) treat the position
  as capped risk. The overspend is invisible until the stop level trades.

## Acceptance criteria

- [ ] A test places an entry whose stop is never accepted, with an older loss
      plan present on the symbol, and asserts the result is `unprotected`
- [ ] The test fails without the fix
- [ ] A loss plan whose price does not match `plan.stopLossPrice` does not
      settle the check
- [ ] In hedge mode, a plan belonging to the opposite side does not settle the
      check
- [ ] A correctly attached stop still returns `stopLoss: "attached"` with
      `unprotected: false`, and the retry path is still reached when no plan
      exists
- [ ] The same assertions hold for the take-profit half

## Out of scope

- The `plansFor` card rendering stays symbol-scoped; only the placement path
  gets identity-aware lookup.
- The `unprotected` result, its i18n key and the stop retry budget are correct
  and stay untouched.
- No live-venue verification: no real orders are placed to observe replace vs.
  stack on Bitunix; the fix must hold under both behaviours.
- Take-profit urgency is not re-prioritised; the retry asymmetry stays as is.
- BUG-0503 (Bitget transmits no stop at all) and BUG-0504 (cross-margin
  liquidation projection) are separate items and keep their own fixes.

## Links

- BUG-0292 — `plansFor` grouping already had a venue-shaped defect; this is the
  second consequence of that function answering for more than one caller
- BUG-0503 — the venue where this check is reached with no stop ever having been
  sent
- BUG-0501, BUG-0499, BUG-0500 — the other guards in this audit that measure
  less than they claim
