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

6. **Open→Flat:** 0.0001 BTC entry + close. Criterion: position returns to
   flat — a 200 proves nothing. Report position states + order IDs.
7. **Attach:** Entry with stop → stop is really attached to the order.
   Only after this may `tpSlAtEntry` flip. Report the order payload as shown
   by `order-info`.
8. **Modify on resting order:** Change price/qty → `order-info` confirms.
   Report requested vs. confirmed values (settles replace-vs-delta).
9. **Incidental observations:** `one_way_mode` wire literal,
   `clientOid`-resubmission behaviour, funding/fee behaviour — report
   whatever normal trading surfaces; the agent records it.

## Out of scope

- Any agent-sent request (forbidden under all circumstances).
- Flipping `tpSlAtEntry` / `SUPPORTS.tpSl` (separate decision after step 7).
- Depositing funds (the trader's decision alone).

## Links

- BUG-0597 — the acceptance this protocol discharges, step by step
- `docs/bitget-api/15_uta_writes.md` — where observations land
- BUG-0503 — the unprotected-window guard this must never regress
