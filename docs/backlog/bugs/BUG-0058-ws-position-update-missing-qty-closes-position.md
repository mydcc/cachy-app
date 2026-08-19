---
id: BUG-0058
title: A WS position push that omits qty silently closes a still-open position
type: bug
status: done
priority: P0
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: []
start_date: 2026-08-08
target_date: 2026-08-13
size: M
estimate: 3
---


# BUG-0058 — A WS position push that omits `qty` silently closes a still-open position

## Symptom

Reported by the user directly after FEAT-0057/BUG-0055 shipped: with a real,
currently open Bitunix position (entry filled, TP and SL set), the Positions
tab is empty and Account Summary shows 0 for margin/PnL — while the entry
fill correctly shows up in the History tab. The position exists on the
exchange and momentarily rendered correctly (via the initial REST fetch),
then disappeared.

## Evidence

**Derived, not demonstrated against a live account** (no live keys
available in this environment) — but the mechanism is unambiguous from
reading the code, and a unit test reproduces it exactly.

`src/stores/account.svelte.ts`, `updatePositionFromWs()`, pre-fix:

```ts
const isClose =
  data.event === "CLOSE" ||
  safeDecimal(data.qty, new Decimal(0)).isZero();
```

`safeDecimal(val, fallback)` returns `fallback` whenever `val` is
`undefined`/`null` — the same fallback (`Decimal(0)`) it also uses to mean
"treat a genuinely absent field as zero" everywhere else in this file. Used
here, a WS position push that simply doesn't repeat `qty` (e.g. an `UPDATE`
event carrying only a changed margin or `unrealizedPNL`, not the unchanged
size) is indistinguishable from an explicit `qty: "0"` — both produce
`Decimal(0).isZero() === true`, so the position gets `splice()`d out of
`accountState.positions` on the very next such push, regardless of whether
the position is actually still open.

This is a **derived-and-then-confirmed-by-test** bug:
`account.test.ts`'s new `'does not close an existing position when a WS
push omits qty'` case fails against the pre-fix code (position count goes
to 0 after a margin-only update) and passes after the fix.

## Cause

`isClose` used one fallback value to mean two different things: "the field
was not sent" and "the field was sent and is genuinely zero." Only the
second should ever close a position.

## Fix

`src/stores/account.svelte.ts`, `updatePositionFromWs()`: only treat a push
as a close when `data.qty` is *explicitly* present and parses to zero, or
`data.event === "CLOSE"`. A push that omits `qty` now falls through to the
normal OPEN/UPDATE path, where `size: safeDecimal(data.qty, existing.size)`
already correctly preserves the last known size.

## Acceptance criteria

- [x] A test reproduces the defect (position removed by a qty-omitting
      update) and fails without the fix
- [x] The test passes with the fix
- [x] A push with an explicit `qty: "0"` still closes the position
- [x] An explicit `event: "CLOSE"` with no `qty` at all still closes the
      position
- [x] Existing `account.svelte.ts` tests continue to pass unchanged

## Links

- `src/stores/account.svelte.ts` — `updatePositionFromWs()`
- `src/stores/account.test.ts`
- [`FEAT-0057`](../features/FEAT-0057-market-activity-panel-redesign.md),
  [`BUG-0055`](BUG-0055-position-mark-price-always-zero.md) — the report
  that surfaced this while re-testing those changes
