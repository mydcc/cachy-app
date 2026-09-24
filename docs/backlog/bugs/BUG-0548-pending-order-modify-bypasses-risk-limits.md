---
id: BUG-0548
title: Pending-order quantity amendments bypass configured risk limits
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: []
---

# BUG-0548 — Pending-order quantity amendments bypass configured risk limits

## Symptom

A resting order can be amended to a quantity above the configured position or loss limit. The modification can pass the order gate and later fill above the user’s risk ceiling.

## Evidence

**Derived.** `src/services/rmsService.ts:373-385` marks `modify` as exposure-increasing, but `checkLimits()` returns without evaluating limits for every non-open/non-add intent in `:515-548`. `TradeService.modifyOrder()` accepts and sends a replacement quantity in `src/services/tradeService.ts:2191-2245`. The modify branch in `src/services/orderGate.ts:1226-1367` checks displayed quantity, venue limits, and step size, while the risk hook at `:1044-1047` receives no limit result for the modification.

## Cause

The risk service treats a pending amendment as if it had no measurable resulting size/stop pair, even though the live order context and proposed replacement quantity are available.

## Fix

Evaluate prospective exposure and resulting stop risk for quantity-increasing modifications before transport. Reuse the existing open/add limit rules where the live order context permits it. Exempt TP/SL-only and otherwise non-exposure-increasing changes, but do not exempt a quantity increase.

## Acceptance criteria

- [ ] A quantity-increasing modify is refused when the resulting position exceeds `maxPositionSizeUsdt`.
- [ ] The account-percentage position cap is enforced for a pending modification.
- [ ] `maxLossPerTradeUsdt` is evaluated against the resulting position and stop.
- [ ] The daily-loss limit remains enforceable for a later fill.
- [ ] Refusal happens before any signed network request.
- [ ] Price-only and TP/SL-only modifications remain usable, with regression tests.

## Out of scope

- Closing or reducing existing positions.
- Automatic cancellation of already-filled positions.
- TP/SL plan semantics unrelated to prospective exposure.

## Links

- `src/services/rmsService.ts:373-385`
- `src/services/rmsService.ts:515-548`
- `src/services/tradeService.ts:2191-2245`
- `src/services/orderGate.ts:1044-1047`
- `src/services/orderGate.ts:1226-1367`
- Existing coverage: FEAT-0013, BUG-0505, BUG-0510; none covers risk-limit enforcement for quantity-increasing modifications.
