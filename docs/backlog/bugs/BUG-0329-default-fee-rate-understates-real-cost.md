---
id: BUG-0329
title: The default fee rate is a maker rate applied to both legs, understating real cost
type: bug
status: done
priority: P1
milestone: none
editions: [community, pro, private]
area: calculator
data_class: none
adr: none
depends_on: []
assignee: claude
---

<!-- Branch: fix/bug-0329-default-fee-rate -->


# BUG-0329 — The default fee rate is a maker rate applied to both legs, understating real cost

## Symptom

Every fee figure Cachy shows before the user edits anything is roughly a
quarter of what a market-in / stop-out round trip actually costs on Bitunix.

`CONSTANTS.DEFAULT_FEES` is `"0.0140"` — 0.014%. Bitunix's published VIP 0
futures rates are **0.0200% maker and 0.0600% taker**. So the default is not
merely stale: it is a *maker* rate, and it is applied identically to the entry
leg and the simulated exit leg.

What the trader sees as a result:

- break-even sits closer to entry than it really is,
- the net loss at the stop is smaller than it really is,
- and therefore the risk/reward ratio — the number the decision is made on —
  is too favourable.

Position *size* is not affected: `calculateBaseMetrics` derives it from
`riskAmount / riskPerUnit`, which fees do not enter. This is a wrong-number
bug, not a wrong-order bug, and ADR-0010 keeps it that way — an estimate never
determines what is sent.

## Evidence

**Derived**, not demonstrated. Nobody has reported it; it follows from reading
two things that disagree:

1. `src/lib/constants.ts:588`
   ```ts
   DEFAULT_FEES: "0.0140",
   ```
2. Bitunix's own published futures schedule for VIP 0: 0.0200% maker,
   0.0600% taker (https://www.bitunix.com/service/handling-fee).

ADR-0010 already reasoned about the direction of the error, before the rate
itself was questioned:

> understates what a stop actually costs and overstates what a target actually
> pays, which makes the risk/reward ratio — the number a trader decides on —
> wrong twice in the same direction

The same ADR quotes "0.014% against 0.042%" for Bitunix maker/taker, which no
longer matches the venue's current published schedule either — so the constant
and the ADR's example are both anchored to an older tariff.

Because it is derived, the fix needs a test that fails first. That test is
cheap here: assert the default rate against the venue's documented taker rate.

## Cause

One constant, used as though it were both legs' rate, in four places:

| Site | Role |
| --- | --- |
| `src/stores/trade.svelte.ts:142` | initial value of `tradeState.fees` |
| `src/services/calculatorService.ts:423` | fallback when the fee field is empty |
| `src/stores/account.svelte.ts:291` | hydrating a position from the WebSocket |
| `src/stores/account.svelte.ts:467` | hydrating positions from REST |

The last two matter most: they apply the optimistic rate to **real open
positions**, not just to a blank calculator.

## Fix

Raise the default to the venue's documented **taker** rate, because a risk
tool should err on the expensive side, and because the exit leg — the one that
is genuinely unknowable at plan time — is assumed taker (see FEAT-0253).

Deliberately **out of scope here**, so this stays a one-line correction that
can ship on its own:

- splitting the constant into separate maker and taker rates,
- making it per-venue,
- deriving the real rate from the broker's own fills.

All three belong to FEAT-0253, which owns the fee model. This bug only stops
the current single default from being the optimistic one.

Note when fixing: the value is a **percentage number**, not a fraction —
`0.06` means 0.06%. The division by 100 happens inside
`calculateBreakEvenPrice`. Writing `0.0006` here would make every fee 100x
too small and turn a four-fold understatement into a four-hundred-fold one.

## Acceptance criteria

- [x] A test asserts the default fee rate is not below the active venue's
      documented taker rate, and fails against the current `"0.0140"`.
- [x] `CONSTANTS.DEFAULT_FEES` is raised to the documented taker rate, with a
      comment naming the venue, the tariff and the date it was read.
- [x] The value stays a percentage number (`0.06` = 0.06%); a test pins the
      unit so nobody "corrects" it into a fraction.
- [x] No change to position sizing — a test shows `positionSize` is unchanged
      by the new default, only the fee-derived figures move.

## Verification

The defect was *derived*, so the test had to fail first. It did, and only it —
the run before the fix:

```
× is at least the venue's documented taker rate
  AssertionError: expected false to be true
  src/lib/calculators/defaultFeeRate.test.ts:66
Tests  1 failed | 6 passed (7)
```

The other six assertions passed before the fix as well, which is the point:
they pin the unit and the blast radius, both of which were already correct.
Only the floor was wrong.

After raising the constant to `"0.0600"`:

- `src/lib/calculators/defaultFeeRate.test.ts` — 7 passed
- `npm run check` — 2134 files, **0 errors** (3 warnings, all pre-existing and
  in unrelated components)
- `npm test` — 311 files passed, 1 skipped; **2654 tests passed, 0 failures**

Nothing else needed changing: the existing calculator tests read
`CONSTANTS.DEFAULT_FEES` symbolically rather than hard-coding `0.0140`, so
they followed the constant instead of pinning the wrong value.

Not yet merged, so no shipped version to record.

## Links

- `src/lib/constants.ts:588` — the constant.
- `docs/adr/0010-estimates-inform-but-never-determine-what-is-sent.md` — why a
  wrong rate is a display problem and must never become an order problem.
- FEAT-0253 — the fee model this bug deliberately does not attempt.
- FEAT-0328 — where the fee question surfaced.
