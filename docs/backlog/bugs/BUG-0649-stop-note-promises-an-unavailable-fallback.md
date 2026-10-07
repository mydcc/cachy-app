---
id: BUG-0649
title: The order form promises a stop will be placed separately on a venue that cannot place it
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
assignee: opencode
branch: fix/bug-0649-stop-note
---

# The order form promises a fallback the gate then refuses

Found by the first live observation of IDEA-0620's Part 1, on 2026-10-07 —
the Bitget entry form, alongside its gate refusal.

## Symptom

On the Bitget entry form, below the size summary:

> This exchange cannot attach a stop to the entry. **The stop is placed as a
> second request**, so the position is briefly unprotected — you will be told if
> it does not arrive.

Clicking PLACE ORDER produces, on the same screen:

> Order refused: bitget cannot place the stop loss for this order — **neither
> attached to the entry nor as a separate order.** The order was not sent.

The form promises the second request; the gate refuses it. The trader is told
twice, on one screen, that the stop will be placed and that it cannot be.

## Cause

The note's condition never asks about the standalone capability:

- `PlaceOrderPanel.svelte:666` — `{#if !caps.tpSlAtEntry}`
- `orderGate.ts:975` — `stopRequested && !caps.tpSlAtEntry && !caps.tpSlStandalone`

The note is written for a venue that cannot attach but *can* place separately.
No such venue exists in the current capability table:

| venue | `tpSlAtEntry` | `tpSlStandalone` | note shown | gate |
|---|---|---|---|---|
| Bitunix | `true` | `true` | no | allows |
| Bitget | `false` | `false` | **yes** | **refuses** |
| `UNKNOWN_EXCHANGE` | `false` | `false` | n/a — no orders offered | — |

So the note is **never true where it appears**. The one venue that shows it is
the one venue where the promised fallback does not exist.

## Fix

Gate the note on the same pair the gate uses, and give it two texts rather than
one:

- cannot attach but can place separately → the current text, which is accurate
- cannot attach **and** cannot place separately → say the entry can only go out
  unprotected, so the trader decides deliberately rather than after a refusal

The second case is Bitget today, and it is a real choice the trader should get
to make before the order, not discover after it.

## Acceptance criteria

- [x] The note cannot appear on a venue where the gate refuses the standalone
      stop, for the current table and for any combination of the two flags
- [x] The wording distinguishes "placed as a second request" from "can only go
      out unprotected"
- [x] A test renders the form with `tpSlAtEntry: false, tpSlStandalone: false`
      and asserts which text appears
- [x] A test renders it with `false / true` and asserts the second-request text
- [x] The note cannot appear when there is no stop to talk about — the gate
      already asks that (`orderGate.ts:977`, a positive Decimal), so the form
      asking it differently is the same defect this item is about. Found in
      review: the first fix warned every Bitget entry, including the many that
      carry no stop, telling the trader to clear one they never set

## Resolution

One predicate, two call sites — `canCarryStopLoss` / `stopLossPlacement` in
`src/services/exchange/stopLossPlacement.ts`. The order form and the gate now
ask the same question about the same two flags, which is what removes the class of
defect rather than this instance of it: `orderGate.ts`'s `unplaceableStop` test
and the panel's note were the same condition written twice, and the panel's copy
was the incomplete one.

Three states rather than a yes/no, because the two failures need different words:
`attached` (nothing to say), `separate` (the existing note, now true where it
shows) and `unprotected` (new — this exchange cannot carry a stop on an entry at
all, clear the stop to send the order deliberately unprotected).

The gate's behaviour is unchanged: `!a && !b` and `!(a || b)` are the same
condition. Its 211 existing assertions stay green, which is the evidence that the
refactor moved nothing.

### Verification

- The component test was written first and failed before the fix, naming the
  missing sentence rather than anything incidental. The other two cases — the
  second-request text where the venue really sends one, and no note at all where
  stops attach — passed before and after, which is what proves the note is chosen
  by the capability pair and not by something incidental to the test.
- Mutation: restoring the old `{#if !caps.tpSlAtEntry}` fails exactly one test,
  with `expected 'Place this position bitget …' to contain 'neither attached to
  the entry nor as a separate order'`. Restored, 40 green across the component,
  the predicate and the gate capability suite.

Not addressed here, and still true: the refusal renders `bitget` while the UI
writes `Bitget`, and paper mode shows a "balance not loaded" note beside an
Account Balance field reading 10000. Both are recorded above.

## Also seen in the same observation, not filed here

- The refusal renders the venue as the raw provider id — **"bitget"** — while the
  rest of the UI writes **"Bitget"** (`displayed.provider` goes into the template
  unchanged)
- In paper mode the form shows **"Balance not loaded — the venue decides whether
  this order is funded"** next to an Account Balance field reading 10000. The note
  comes from `accountState.readUsdtBalance("paper")` and the field from another
  source; in paper mode no venue decides anything

## Links

- IDEA-0620 — where this was observed
- BUG-0648 — the stale-calculation defect found in the same session
- BUG-0597 — the Bitget UTA write port