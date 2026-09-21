---
id: BUG-0515
title: The open-positions limit exempts any symbol already held, so in hedge mode the opposite side opens a second position the configured ceiling never counts
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

# BUG-0515 — A limit on positions that matches on symbols

## Symptom

`maxOpenPositions` is the trader's own ceiling on how many positions may be
open at once. In hedge mode it can be exceeded, because the check exempts any
symbol that already has a position — and in hedge mode the opposite side on
that same symbol is a *second* position, not a change to the first.

## Mechanism

`src/services/rmsService.ts:305`:

```ts
private checkOpenPositions(intent: OrderIntent): OrderRefusal | null {
    const max = riskState.maxOpenPositions;
    if (max === null) return null;

    const symbol = intent.displayed.symbol;
    const positions = omsService.getPositions();
    // Adding to a position already open does not raise the count.
    if (symbol !== undefined && positions.some((p) => p.symbol === symbol)) return null;

    if (positions.length + 1 > max) {
        return limitRefusal("maxOpenPositions", max, positions.length + 1);
    }
    return null;
}
```

The early return is correct reasoning for one-way mode: an open on a symbol
already held merges into the existing position and the count does not grow. It
is wrong in hedge mode, where long and short on one symbol are two independent
positions with their own ids, margins and liquidation prices — which is exactly
how the rest of the app treats them (`positionSide` is carried on every close,
add and protection call, and `TradeService.changePositionMode` exists to switch
between the two modes).

`positions.some(p => p.symbol === symbol)` cannot tell those two cases apart
because it does not look at the side. The intent carries one — the count check
simply never reaches it.

## Worked example

`maxOpenPositions = 3`, hedge mode, longs open on BTC, ETH and SOL:

| action | `some(p.symbol === symbol)` | outcome | positions after |
|---|---|---|---|
| open long on XRP | false | counted: 3 + 1 > 3 → **refused** | 3 |
| open **short** on BTC | true | exempt, no count → **approved** | 4 |
| open **short** on ETH | true | exempt, no count → **approved** | 5 |
| open **short** on SOL | true | exempt, no count → **approved** | 6 |

The overshoot is bounded — each held symbol can double, so the reachable
maximum is twice the number of held symbols — but the configured ceiling of 3
is breached while a fresh symbol at the same count is refused. The limit is
strictest against the position that adds one symbol and blind to the one that
doubles an existing exposure.

## Sibling defect, same shape

This is `BUG-0502`'s shape in a second place: a lookup keyed on symbol alone
where the side is what distinguishes the two objects. There,
`plansFor(symbol)` lets the opposite side's stop satisfy a protection check;
here, the opposite side's position escapes a count. Both read a symbol out of
the intent and stop before the field that disambiguates it.

Worth fixing together — not because the code is shared (it is not), but because
a reviewer who has internalised one will spot the other, and because a repo-wide
sweep for symbol-keyed position lookups is cheaper once than twice.

## Acceptance Criteria

- [ ] The exemption applies only when the intended side matches a position
      already open on that symbol — in hedge mode, a new side is counted as a
      new position.
- [ ] The count itself is unchanged in one-way mode, where the current
      behaviour is correct.
- [ ] `checkOpenPositions` reads the position mode, or states in a comment why
      matching on `symbol + side` is correct in both modes without reading it.
- [ ] Regression test: hedge mode, `max` reached, open the opposite side on a
      held symbol — assert refused.
- [ ] Regression test: one-way mode, `max` reached, open more of a held symbol
      — assert still approved, so the fix does not turn adds into refusals.

## Out of Scope

- `BUG-0502`'s protection-check lookup. Same shape, separate item, separate fix.
- Whether `maxOpenPositions` should count hedged pairs as one or two
  conceptually. This item takes the app's own answer — two positions, two ids,
  two liquidation prices — and asks the counter to agree with it.
- The add path's exemption from the size limits (`BUG-0508`, `BUG-0510`).
