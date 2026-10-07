---
id: BUG-0648
title: Clearing the stop leaves the previous calculation standing, and the order is built from it
type: bug
status: ready
priority: P1
milestone: none
editions: [community, pro, private]
area: execution
data_class: none
adr: none
depends_on: []
assignee: opencode
branch: fix/bug-0648-stale-submit
---

# Clearing the stop leaves the previous calculation standing

Found by the first live observation of IDEA-0620's Part 1, on 2026-10-07.
Reported by the trader against the deployed build `15a473bc8`, Bitget, zero
balance, paper mode.

## Symptom

The gate refuses a Bitget entry with the stop-loss refusal:

> Order refused: bitget cannot place the stop loss for this order — neither
> attached to the entry nor as a separate order. The order was not sent. Clear
> the stop to place a deliberately unprotected entry.

Clearing the stop — ATR toggle off, Manual Stop Loss empty — and clicking again
produces **the same refusal**, and the summary still reads:

```
SIZE 25.38 | MARGIN 6530.78 | ENTRY 2573.2 | STOP 2533.8
```

The order carries the stop the trader just removed, and the refusal's own
remediation instruction cannot be carried out.

A later screenshot shows both states at once: a complete summary
(`SIZE 0.25 | MARGIN 64.25 | ENTRY 2570.17 | STOP 2530.77`) **and**, directly
below it, `Please enter required trade data to start calculation.`

## Cause

Two state holders that are not cleared together.

`tradeState.currentTradeData` is the object the panel renders from and the
object `submit()` builds the order from:

- `PlaceOrderPanel.svelte:143` — `const data = $derived(tradeState.currentTradeData)`
- `PlaceOrderPanel.svelte:340` — `marginFunded`/`liveMarginFunded` are derived from it, so it also decides whether submit is enabled

`calculatorService.ts` writes it on a successful calculation (`:451`) and **no
production path assigns it `null`** — only the initialiser
(`trade.svelte.ts:229`, `:273`). The rejection paths do not touch it:

- `getAndValidateInputs` returns `STATUS_INCOMPLETE` when the stop is
  non-positive (`:568`)
- `handleValidationResult` catches that and calls `clearResults(true)`, then
  returns early (`:171-175`) — before the write, and without clearing
- `handleCalculationError` (`:455`) shows a toast and clears nothing
- `clearResults()` (`:128`) calls `resultsState.reset()`, which is
  `Object.assign(this, INITIAL_RESULTS_STATE)` (`results.svelte.ts:97`) — scoped
  to `resultsState`, never `tradeState`

So clearing the stop resets the *results* while the *trade data* stays. That is
the path the observation below exercises, and it is verified end to end.

### Not established: what cleared it later

The observation is not one continuous state. The second screenshot shows the
stale summary *and* `promptForData` together, which is the `STATUS_INCOMPLETE`
path exactly. But the **last** screenshot shows the order summary gone and
`orderEntry.notReady` instead — and that note only renders when `data` is falsy
(`PlaceOrderPanel.svelte:656`, `{#if data && data.positionSize.gt(0) && …}`).

So `currentTradeData` did become falsy at some point, and **the code read here
does not explain it.** Ruled out: `applySymbolRefresh` (does not mention the
field), and any `INITIAL_TRADE_STATE` reassignment outside
`+layout.server.ts`, which only serialises it. Not ruled out: a path not traced
here, or the store being re-created between screenshots.

Recorded rather than explained, because the fix should not be designed on a
mechanism that has a hole in it.

## Consequence

Two, and the second is the one that matters:

1. The trader sees a stale result beside a live "not calculated" message, with
   nothing indicating that the two disagree.

2. **A stale stop can reach the venue.** It needs the other gates to pass, so at
   zero balance it does not — margin refuses first, which is why the button was
   disabled in the observation. On a funded account the button enables and the
   order is built from the uncleared `currentTradeData`. A trader who removed a
   stop deliberately can still send one.

How long the stale object survives is the open question above: it outlived one
stop-clear in the observation, and was gone by the next screenshot. The window is
unbounded by anything found in the code, which is the problem.

The same split explains why `orderGate.unplaceableStop`'s remediation read as a
dead end for the trader: the instruction is correct, and the state it asks for
was not reached by the sequence the trader followed.

## Fix

Deliberately unspecified. The obvious move — null `currentTradeData` whenever a
calculation does not complete — is safe but not obviously right: some callers may
depend on the last good calculation while the trader edits. That needs a
first-hand look at who reads `currentTradeData`, which is what this item is for.

The narrower question, and the one worth answering first: should a submit that
carries a stop the trader has removed from the form be possible at all? The
panel can compare `data.stopLossPrice` against `tradeState.stopLossPrice` and
refuse when they disagree, which closes the money path without deciding the
`currentTradeData` lifetime question.

## Acceptance criteria

- [x] `PlaceOrderPanel.submit()` cannot send a quantity, price, stop or target
      that `data` holds but `tradeState` no longer does
- [ ] Clearing the stop stops the summary from showing the previous `SIZE`,
      `MARGIN` and `STOP` — or is documented as intentional, with the reason
- [ ] A summary that renders while `dashboard.promptForData` is displayed is
      either impossible or explained on screen
- [x] A test reproduces the defect: a successful calculation, then the stop
      cleared, then a submit — and fails without the fix, naming the stale field
- [~] The gate's remediation instruction in `orderGate.unplaceableStop` is
      reachable on a venue that cannot carry a stop — **still not**, and this
      ships knowing it. The wrong order is gone; the route to the right one is
      not. See the Resolution.

## Evidence

Trader screenshots, 2026-10-07, deployed build `15a473bc8` (26 commits behind
`develop`, gate and placement code identical):

- refusal repeated after the stop was cleared, summary unchanged
- summary and "enter trade data" error visible simultaneously
- button disabled by margin at zero balance — **no order was sent in this
  observation**, and no funds moved

The claim that the stale order *would* reach a funded account is derived from
the code path above, not observed. It should be confirmed before the fix is
designed around it.

## Resolution, first half — the money path is closed

`submit()` now refuses before anything is built when `data` and the form
disagree — and "the form" means every field the calculation consumes: account
size, risk percentage, entry price, stop, leverage and the take-profit legs,
plus symbol and direction. It says so (`orderEntry.errors.staleCalculation`) and
sends nothing.

The guard belongs here and not in the gate because the gate compares the payload
against the intent and **both are built from `data`**. It cannot see a
disagreement that exists inside the one object it trusts. Everywhere else the
gate is the right place; this is the exception, and the reason is structural.
`orderGate.ts:1872` shows the same blindness for leverage: it compares
`payload.leverage` with `displayed.leverage`, and both arrive from `data`.

### One rule that had to be sharpened

The first version treated an absent store field as "the trader cleared it". That
is wrong, and eight existing tests said so — `PlaceOrderPanel.confirmation`
mocks `tradeState` without `entryPrice`, `stopLossPrice`, `tradeType` or
`targets`, so every case read as a disagreement and the confirmation dialog never
opened.

An empty field is a **claim**; a missing field is not one. The comparison now
skips `undefined`. In production these are `string | null` and never
`undefined`, so no runtime behaviour changes — it only stops the guard reading a
partial mock as a withdrawal.

Worth recording because the broken version would have been invisible in
production and would have failed at the next refactor instead.

### What the review changed

A reviewer read the first version and was right about the gap that mattered most:
the guard covered the fields that had occurred to me and not the fields that feed
the calculation. `positionSize` and `requiredMargin` are functions of account
size, risk percentage, entry price, stop, leverage and fees
(`calculatorService.ts:478-492`), so guarding four of those six was BUG-0648 one
field over — change the leverage and the frozen size went out against the old
one. The three scalars are guarded now.

Three more findings, all confirmed by reading the code rather than taking the
review on trust:

- **`new Decimal()` unguarded.** `TradeTargetSchema.price` carries no numeric
  refine (`trade.svelte.ts:159`), so any string can reach the comparison. A throw
  inside a `$derived` does not refuse the click, it breaks the panel on every
  re-evaluation — the auto-update ticker would take it down. `parseDecimal`, which
  the calculator uses on these exact fields, was already imported.
- **Exact comparison where the calculator has a tolerance.** It skips the store
  write-back when the derived stop moved less than `0.000001`
  (`calculatorService.ts:429`) and assigns `currentTradeData` anyway, so `data`
  can hold a stop the store never received. Comparing exactly refused that order
  forever with no input that helps. Both now share one named delta. The gate's
  own `decimalsAgree` could not be borrowed for this — it is `a.eq(b)`, exact.
- **The message sent the trader into the dead end.** It said "re-enter the entry
  and stop", which on Bitget is what the gate had just told them not to do. It
  now describes the state — the figures come from an earlier calculation — and
  names what is compared, without prescribing an input.

One more, found while fixing: the test fixture never reset `symbol` and
`tradeType`, so the case that changes them leaked into every later case and failed
them for the wrong reason. The false-green trap has a second face.

### Verification

- Thirteen cases in `PlaceOrderPanel.staleSubmit.component.test.ts`, driving
  `currentTradeData` and the form inputs apart by hand.
- **The control case came first and caught a false green.** The first three cases
  passed immediately because my modal mock never resolved, so nothing was ever
  placed — and "nothing was placed" was what each stale case expected. A case
  asserting a *successful* placement exposed it. A guard that cannot fail is worse
  than no guard.
- **Every refusal case asserts two things**: that nothing was sent *and* that the
  guard's own message was shown. Asserting only the first passes just as well when
  the button was disabled or the dialog rejected — neither of which is this guard.
- **The control asserts the payload**, not just the call count. For a guard whose
  whole job is "do not send the wrong numbers", the numbers are the contract.
- **Mutation, one branch at a time.** Removing the leverage comparison, the
  account-size comparison, the tolerance or `parseDecimal` each fails exactly one
  case and leaves the other twelve green. A branch that only stays green because
  of a different one is not pinned.
- 153 tests across `src/components/results/`, `orderGate.capabilities` and
  `tradeService_placeOrder`. `npm run check` clean for every file touched; the one
  remaining error (`marketWatcher.bench.ts`, `Property 'bench' does not exist on
  type 'TestContext'`) and all six warnings are pre-existing in files this does not
  touch.

- Six cases in `PlaceOrderPanel.staleSubmit.component.test.ts`, driving
  `currentTradeData` and the form inputs apart by hand.
- **The control case came first and caught a false green.** The first three cases
  passed immediately because my modal mock never resolved, so nothing was ever
  placed — and "nothing was placed" was what each stale case expected. A fourth
  case asserting a *successful* placement is what exposed it. A guard that cannot
  fail is worse than no guard.
- Mutation, removing the guard: exactly the three stale cases fail, the control
  stays green. Removing **only** the take-profit comparison fails exactly the one
  leg case and leaves the other five green — so that branch is pinned
  independently rather than riding on the others.
- 146 tests across `src/components/results/`, `orderGate.capabilities` and
  `tradeService_placeOrder`. `npm run check` clean for every file touched; the
  one remaining error (`marketWatcher.bench.ts`, `Property 'bench' does not exist
  on type 'TestContext'`) is pre-existing and not in this diff.

## Still open — the second half

**The gate's remediation is still not reachable, and this does not change that.**
Clearing the stop now refuses at the panel instead of at the gate, but it still
refuses, because `data` never clears. The trader cannot yet place the
deliberately unprotected entry the refusal tells them to place.

What the fix changes is that the refusal can no longer send a stop they removed.
That is the money-path half, and it is the half that was reachable without a
product decision.

The other half is visible: **should the summary blank when a recalculation is
refused?** That is a product decision about what the trader sees mid-edit, not a
safety one, so it is not taken here.

The groundwork is already established, so whoever takes it does not start from
zero — `currentTradeData` has exactly two readers outside the store:

- `PlaceOrderPanel.svelte:143` — the only consumer of the values
- `app.ts:203` — already null-safe (`?.positionSize?.gt(0)`), and refusing with
  `errors.invalidTrade` is the right answer when there is no valid calculation

One caller is outside this panel: the alert engine places through the same
service (`stores/alerts.svelte.ts:300`), which is why the guard could not simply
move down into `orderPlacementService`. That path builds its plan from market
state rather than from a form, so the stale-form hazard is specific to the panel —
but a service-level check remains the stricter home if the inputs ever grow.

So nulling it on a refused calculation appears to be safe; what is undecided is
whether blanking the summary is the behaviour a trader wants. `BUG-0649` is the
neighbour here: the panel's own note now says "clear the stop", and until this
half lands, clearing it is a dead end.

## Links

- IDEA-0620 — the protocol this came out of
- BUG-0597 — the Bitget UTA write port; its entry path is blocked independently
- BUG-0503 — the unprotected-window item; a stale stop is not that window, but
  the two compound