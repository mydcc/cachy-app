---
id: BUG-0418
title: Switching between paper and live keeps the previous mode's leverage and fees
type: bug
status: in-progress
priority: P1
milestone: none
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: []
assignee: claude
---

# BUG-0418 — Switching between paper and live keeps the previous mode's leverage and fees

## Symptom

After switching paper trading on or off, `tradeState` still holds the leverage,
margin mode and maker/taker fees of the mode just left, with a freshness stamp
that reads as current. A position size calculated right after the switch is
priced against numbers from the other world — live fees on a simulated order,
or simulated ones on a real order.

The mode chip shows the matching display fault: the margin half survives the
switch while the position half is cleared, so the two halves describe different
worlds. The BUG-0409 skew rule only blanks the older half once the stamps drift
two minutes apart, so a quick switch pairs them silently.

## Evidence

**Demonstrated.** `src/services/paperTrading_modeSwitch.test.ts` fails on the
unfixed code — four cases, covering leverage, both fees, and the margin mode
with its stamp, in both switch directions.

Two paths clear account state, and they disagree:

- `src/services/accountSession.svelte.ts:123` — a real account switch calls
  `accountState.reset()` **and** `tradeState.clearRemoteAccountState()`.
- `src/services/paperTradingService.ts:208` — a mode switch called only
  `accountState.reset()`.

`clearRemoteAccountState()` documents itself as "the safety-critical half of
clearing on an account switch", and names the reason: the FEAT-0011 gate reads
`remoteAccountStateAt` purely as an age, never as an identity, so stale values
beside it read as fresh.

## Cause

A mode switch is an account switch — different book, different leverage,
different fees — but it was not written as one. `setEnabled()` grew its own
clearing sequence beside `accountSession.reset()`'s, and the two drifted. The
half that was forgotten is the half that prices orders.

## Fix

`paperTradingService.setEnabled()` clears `tradeState` alongside
`accountState`. `tradeState` is already imported there, so this needs no new
dependency.

Deliberately **not** changed: `resetBook()` also calls `accountState.reset()`
without clearing `tradeState`. That is correct — it resets the simulated book
within one mode, and the remote values describe the account, not the book.

## Acceptance criteria

- [x] A test fails before the fix and passes after, in both switch directions
- [x] Leverage, margin mode, both fees and the freshness stamp are all cleared
- [x] `resetBook()` is left alone, with the reason recorded
- [x] Full unit suite and svelte-check clean

## Links

- [BUG-0409](BUG-0409-mode-chip-stale-after-change.md) — the freshness stamps this relies on
- [FEAT-0417](../features/FEAT-0417-account-state-write-guard.md) — the CI guard for the other half of this class
