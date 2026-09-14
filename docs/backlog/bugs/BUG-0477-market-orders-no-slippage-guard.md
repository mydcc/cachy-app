---
id: BUG-0477
title: MARKET orders carry no slippage or deadline protection
type: bug
status: ready
priority: P2
milestone: M9
editions: [community, pro, private]
area: execution
data_class: none
adr: none
depends_on: []
---

# BUG-0477 — MARKET orders carry no slippage or deadline protection

## Symptom

Orders default to `MARKET` (`src/services/tradeService.ts:1395`) with `GTC` time-in-force and no slippage tolerance, no price-protection bound, and no deadline. In a volatility spike or on an illiquid symbol the fill can land far from the price the trader (or the AI-suggested setup) based the sizing on — the CEX equivalent of an unprotected swap.

## Evidence

**Derived.** `placeOrder` builds the payload with `orderType ?? "MARKET"` and no slippage/deadline fields (`tradeService.ts:1394-1472`); the gate checks order-type *support* (`orderGate.ts:683-711`) but no price-deviation bound; no per-strategy slippage table exists. The AI safety rules even tell the model to ignore spread/imbalance unless extreme (`safetyRules.ts:33-37`), while execution offers no backstop for exactly that case.

## Cause

Slippage protection was never specified: the venue is assumed liquid, and the order path optimizes for fill certainty.

## Fix

1. Add a configurable max-deviation guard: refuse (or require explicit re-confirmation for) MARKET orders when mark price has moved more than X% since the displayed snapshot the gate already compares against.
2. Prefer LIMIT-with-protection for AI-shaped entries where the venue supports it, or document why MARKET stays the default.
3. Tests: stale-snapshot MARKET intent (price moved > bound) is refused; fresh intent passes.

## Acceptance criteria

- [ ] A MARKET order against a moved market is refused or escalated to re-confirmation (test fails without the fix)
- [ ] Bound is user-configurable with a conservative default; zero disables only via explicit opt-out
- [ ] Reduce-only closes and cancels are never blocked by this guard (closing matters most when markets move)

## Out of scope

- Venue-native stop/trigger orders (capability matrix already covers support)
- MEV/private-mempool routing (no on-chain execution exists in this app)

## Open questions

- None.

## Links

- Audit: LLM Trading Agent Security (2026-09-14), checklist item 8
- Related: [`FEAT-0011`](../features/FEAT-0011-preflight-order-verification.md)
