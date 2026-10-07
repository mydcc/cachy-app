---
id: IDEA-0620
title: Trader test protocol for Bitget UTA writes, zero-balance first
type: idea
status: ready
priority: P1
milestone: none
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: [BUG-0597]
assignee: human
---

# IDEA-0620 — Trader test protocol for Bitget UTA writes, zero-balance first

## Problem

Phases A–F (code, tests, refusals) are merged and CI-green, but no live
behaviour has been observed: the account holds 0, there are no demo API keys,
and agents never hold keys or send requests. Without a written protocol the
verification either never happens or happens incompletely, and BUG-0597's
acceptance ("position returns to flat, verified against a real position")
stays open indefinitely.

## Proposal

The trader executes the steps below in order and reports each result back to
the agent, who records observation-gated answers into BUG-0597 /
`15_uta_writes.md`. Steps 1–5 need no balance and no deposit; steps 6–9 need
a funded account (the trader's decision — 0.0001 BTC ≈ $11 notional, fees in
cents) and wait until then.

### Part 1 — zero balance, geldneutral (do now)

Steps 1–5 need **no real deposit**. Step 2 additionally needs **paper mode
on**: `PlaceOrderPanel` enables submit only when `requiredMargin <= available`
(`liveMarginFunded`), so at a zero live balance the gate is never consulted and
the step cannot be run there. Paper starts at a simulated 10000 USDT, which is
enough — and the capability refusal is venue-based, so it fires the same way.

1. **Reads:** Balance shows 0, positions empty, order history empty, market
   data live, no API errors in console/network. Expected: all green.
2. **Gate refusal:** Bitget entry *with* stop → must be refused naming venue
   + missing capability (no generic mismatch). Entry *without* stop proceeds
   to confirmation. Report the refusal wording verbatim.
3. **TP/SL verbs:** TP/SL controls on the (absent) position → refusal, never
   silence. Modify carrying protection fields → typed `VALIDATION_ERROR`
   refusal. Report each wording.
4. **Paper flow:** Paper mode on, entry without stop → simulated through to
   confirmation/history. Entry with stop on paper → still refused (gate is
   venue-based, not balance-based). Report any deviation.
5. **Close on empty:** Close / flash-close with no position → clean
   "nothing to close" answer, no 500, no hanging stops. Report the answer.

### Part 2 — funded account only (waits for the trader's deposit decision)

Steps 6–9 all need a resting order, and a resting order needs margin. So
step 8 — the replace-vs-delta question — is **not** reachable with keys alone at
zero balance. It waits on the deposit decision like the rest of Part 2. Nothing
in Part 1 is blocked by that: steps 1–5 send no order that can fill, so they run
on keys and a zero balance as they stand.

6. **Open→Flat:** 0.0001 BTC entry + close. Criterion: position returns to
   flat — a 200 proves nothing. Report position states + order IDs.
7. **Attach:** Entry with stop → stop is really attached to the order.
   Only after this may `tpSlAtEntry` flip. Report the order payload as shown
   by `order-info`.
8. **Modify on resting order — settle replace-vs-delta.** **Change the
   quantity, not only the price.** BUG-0647 stopped Cachy sending a quantity the
   caller did not state, so a price-only modify now sends no `qty` at all and
   `order-info` returns the resting size unchanged. That reads exactly like
   "replace, confirmed" and settles nothing — it is the absence of a change,
   not an observation of one.

   The probe, with the resting order far enough from market that it cannot fill:

   | step | action | expected under replace | expected under delta |
   |---|---|---|---|
   | a | place a resting limit at qty **0.0001** | 0.0001 | 0.0001 |
   | b | `order-info` → read the confirmed qty | 0.0001 | 0.0001 |
   | c | modify **qty only**, to **0.0002**, price untouched | — | — |
   | d | `order-info` → read the confirmed qty | **0.0002** | **0.0003** |

   `0.0002` is replace; `0.0003` is delta. Then cancel the order. Report the two
   `order-info` qty values verbatim — that pair is the whole answer.

   Useful to run twice: first through Cachy, then as a raw signed
   `modify-order` call with the same body. Through Cachy confirms what the app
   does; the raw call isolates the venue from the app, so a disagreement points
   at the builder instead of at the venue.

   Until this is observed, Cachy sends no quantity on a price-only amend, which
   is correct under either reading. Do not read that safety as an answer.
9. **Incidental observations:** `one_way_mode` wire literal,
   `clientOid`-resubmission behaviour, funding/fee behaviour — report
   whatever normal trading surfaces; the agent records it.

## Out of scope

- Any agent-sent request (forbidden under all circumstances).
- Flipping `tpSlAtEntry` / `SUPPORTS.tpSl` (separate decision after step 7).
- Depositing funds (the trader's decision alone).

## Observations — 2026-10-07, deployed build `15a473bc8`

Bitget, zero balance, paper mode for step 2. No funds moved; no order was sent.

| step | result |
|---|---|
| 1 Reads | **Passed.** Available 0 USDT, Margin 0, PnL 0, Positions 0, Orders 0, History "No history found." No API error visible in console or network. |
| 2a entry with stop | **Passed, twice.** `orderGate.unplaceableStop`, naming the venue: "Order refused: bitget cannot place the stop loss for this order — neither attached to the entry nor as a separate order. The order was not sent. Clear the stop to place a deliberately unprotected entry." |
| 2a remedy | **Failed.** Clearing the stop (ATR off, manual field empty) and resubmitting produced the identical refusal with the summary still reading `STOP 2533.8`. Filed as BUG-0648. |
| 2b entry without stop | **Not reachable.** Clearing the stop leaves the order carrying it (BUG-0648); on a fresh form a stopless entry has no computable size, so submit stays disabled. Blocked both ways. |
| 3a TP/SL control on an empty account | **No control exists.** Traced: `canPlaceStandaloneTpSl = capabilities.tpSlStandalone` (`PositionsSidebar.svelte:1248`), and Bitget declares `false` — so `ontpSl` is `undefined` and the per-position control is not rendered. Two independent reasons it is absent: no position to attach it to, and a capability Bitget does not offer. The step's expectation of "a refusal, never silence" cannot be observed, because Cachy never offers the control — which is stronger than refusing, but leaves the standalone-TP/SL refusal path unexercised on Bitget. |
| 5 close on empty | **Button not rendered.** Traced: the close-all button is inside the `{:else}` branch of `{#if safePositions.length === 0}` (`PositionsList.svelte:150`), so an empty account shows only "No open positions" and never the button. Correct as UX; it makes the step unreachable and leaves `trade.closeAllEmpty` — "No open positions to close." — as a string no user can see. The guard in `confirmAndCloseAllPositions` is likewise unexercisable through the UI. |

**Part 1 is concluded.** One step passed, one step passed but its own remedy is
broken, and three steps are structurally unreachable — two because Cachy
correctly declines to offer a control, one because a defect blocks both ways.
None of that needs a deposit, so nothing here waited on the trader's money
decision; Part 2 does.

Two further defects surfaced in the same screen and are filed: BUG-0648 (stale
calculation) and BUG-0649 (the form promises a second-request stop the gate
refuses). Neither is visible from the code or the tests alone.

**Also worth recording:** the deployed build is 26 commits behind `develop`.
`orderGate.ts` is identical between them, so the refusal text observed is the
current text — which is why step 2a's wording can be recorded as evidence. The
chart granularities are **not**: `3m`, `6h`, `12h` and `1M` fail on that build
and work on `develop`, so timeframe behaviour must not be observed there.

## Links

- BUG-0597 — the acceptance this protocol discharges, step by step
- `docs/bitget-api/15_uta_writes.md` — where observations land
- BUG-0503 — the unprotected-window guard this must never regress
