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
branch: fix/live-observation-findings
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

- [ ] `PlaceOrderPanel.submit()` cannot send a quantity, price, stop or target
      that `data` holds but `tradeState` no longer does
- [ ] Clearing the stop stops the summary from showing the previous `SIZE`,
      `MARGIN` and `STOP` — or is documented as intentional, with the reason
- [ ] A summary that renders while `dashboard.promptForData` is displayed is
      either impossible or explained on screen
- [ ] A test reproduces the defect: a successful calculation, then the stop
      cleared, then a submit — and fails without the fix, naming the stale field
- [ ] Whatever the fix, the gate's remediation instruction in
      `orderGate.unplaceableStop` is actually reachable on a venue that cannot
      carry a stop

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

## Links

- IDEA-0620 — the protocol this came out of
- BUG-0597 — the Bitget UTA write port; its entry path is blocked independently
- BUG-0503 — the unprotected-window item; a stale stop is not that window, but
  the two compound