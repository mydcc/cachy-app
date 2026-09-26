---
id: BUG-0568
title: Quantity shrink with pumped price escapes the size caps without a loss limit
type: bug
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: [BUG-0567]
---

# BUG-0568 — Quantity shrink with pumped price escapes the size caps without a loss limit

Follow-up to the BUG-0567 review (PR #3673, MEDIUM finding).

## Symptom

A pending-order amendment from 1.0 BTC at 50 000 to 0.9 at 500 000 is a
"shrink" by quantity (0.9 < 1.0) but carries 9x the notional. The BUG-0567
shrink path runs only `checkLossPerTrade`, which returns `null` immediately
when no loss limit is configured — so the amendment passes with neither a
size nor a loss measurement.

## Evidence

**Derived** — `src/services/rmsService.ts` `checkLimits`, modify branch:
the shrink path calls `this.checkLossPerTrade(intent)` only, and
`checkLossPerTrade` returns `null` as its first statement when
`maxLossPerTradeUsdt` is unconfigured. `checkPositionSize` (via
`notionalOf`, which already handles the modify kind) never runs there.

## Cause

The modify exemption is quantity-shaped: BUG-0548 gated the whole branch on
quantity growth, BUG-0567 decoupled the loss measurement from it, but the
size caps are still coupled to quantity growth. Price is the other half of
notional and is unbounded on the shrink path.

## Fix

Either run `checkPositionSize` on the shrink path too (the loss-only
exemption becomes a daily-loss-only exemption), or bound the
`payload.price` deviation a shrink may carry. Whichever is chosen must keep
the BUG-0567 acceptance criteria green: ordinary shrinks with sane prices
stay approved, price-only amendments keep their full exemption.

## Acceptance criteria

- [ ] A test reproduces the defect (qty shrink with pumped price past the
  size cap, no loss limit configured) and fails without the fix
- [ ] The test passes with the fix
- [ ] All BUG-0548 and BUG-0567 tests still pass unmodified

## Out of scope

- Venue-side price sanity (the venue would hardly fill an absurd price;
  this is defense in depth at the gate).
- TP/SL-only amendments (never reach the modify branch).

## Links

- `src/services/rmsService.ts` (modify branch, `checkPositionSize`, `notionalOf`)
- BUG-0548 (quantity-shaped exemption), BUG-0567 (loss decoupled, size still coupled)
