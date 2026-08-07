---
id: BUG-0002
title: Trade state stores numbers where its type declares strings
type: bug
status: done
priority: P0
milestone: M0
editions: [community, pro, private]
area: calculation
data_class: A
adr: none
depends_on: []
---

# BUG-0002 — Trade state stores numbers where its type declares strings

## Symptom

A take-profit target with a numeric price of `0` survives a filter written to
remove zero-price targets, and would be treated as a real target.

## Evidence

**Derived, and demonstrated only in isolation.** Full analysis:
[`../../TODO.md`](../../TODO.md) item 2.

`TradeStateSnapshot` declares `entryPrice: string | null` and
`TradeTarget.price: string | null`. Three call sites pass numbers:
`src/services/app.ts:130`, `src/components/shared/MarketOverview.svelte:356`,
`src/lib/presets.ts:97`.

`trade.svelte.ts` filters with `(t) => t.price !== null && t.price !== "0"`.
`"0" !== "0"` is `false`, so a string zero is removed as intended — but
`0 !== "0"` is `true`, so a numeric zero passes.

No path has been traced that actually puts a numeric `0` there. That is the open
question, not a known incident.

`tradeState.update()`/`set()` are still typed `(curr: any) => any` with an
explicit `eslint-disable`, because giving them the real type made the
typechecker reject those three call sites. The disable comment is the marker.

## Cause

The store's declared type and its callers disagree, and the `any` signature has
been hiding it.

## Fix

**Resolved** (commit `9df1928`, merged via PR #1605). Went with the second
option: widened `TradeTarget.price`/`percent` and the related
`TradeStateSnapshot` fields to `string | number | null`, and replaced the
string comparison in `trade.svelte.ts`'s target filter
(`t.price !== null && t.price !== "0"`) with `!new Decimal(t.price).isZero()`,
wrapped in a try/catch that treats an unparsable value as filtered-out rather
than throwing. `tradeState.update()`/`set()` carry the real
`TradeStateSnapshot` type with no `eslint-disable`.

## Acceptance criteria

- [x] A test constructs the state a numeric zero would produce and asserts the
      target is filtered out (`tradeStore.test.ts`, "should handle numeric
      zero prices in filter logic using Decimal") — exercises the same
      `Decimal.isZero()` logic `trade.svelte.ts`'s `load()` runs, though
      against an inline copy of the filter rather than calling `load()`
      itself
- [x] `tradeState.update()`/`set()` carry real types with no `eslint-disable`
- [x] All three call sites (`app.ts`, `MarketOverview.svelte`, `presets.ts`)
      typecheck without casts
- [x] `npm run check` clean, full suite green

## Links

- [`docs/TODO.md`](../../TODO.md) item 2
- `src/stores/trade.svelte.ts`, `src/services/app.ts`, `src/lib/presets.ts`
