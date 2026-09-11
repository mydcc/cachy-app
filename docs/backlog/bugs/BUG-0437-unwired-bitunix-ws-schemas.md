---
id: BUG-0437
title: Bitunix order/position/ticker validation schemas are never wired
type: bug
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: backend
data_class: none
adr: none
depends_on: []
---

# BUG-0437 — Bitunix order/position/ticker validation schemas are never wired

## Symptom

`BitunixTickerDataSchema`, `BitunixOrderSchema` and `BitunixPositionSchema`
(`src/types/bitunixValidation.ts`) are imported only by their own unit test.
No runtime path validates against them, so the BUG-0424 money-boundary
hardening on those three schemas never executes. The live WS path hand-coerces
only `positionId`/`orderId` and leaves every money field as a raw value until
`safeDecimal`/`parseDecimal` converts it.

## Evidence

**Derived**, from reading the code.

- Searching `Bitunix(Position|Order|TickerData)Schema` in `src` matches only the
  definitions in `bitunixValidation.ts` and the imports in
  `bitunixValidation.money.test.ts`.
- `src/services/bitunixWs/messageParser.ts` imports only
  `BitunixWSMessageSchema`, `StrictPriceDataSchema`, `StrictTickerDataSchema`
  and `StrictDepthDataSchema`.
- `src/services/bitunixWs/channelDispatch.ts:253-296` validates the envelope,
  coerces `positionId`/`orderId` to string, then hands the raw object to
  `accountState.updatePositionFromWs` / `updateOrderFromWs` /
  `updateBalanceFromWs`. `mapToOMSPosition` (`src/services/mappers.ts:69`)
  converts each field with `parseDecimal`.

No live precision loss is demonstrated: `decimal.js` parses a number via its
shortest round-trip string, so the values survive. The defect is that the
hardening is inert and the schemas are dead — a future float operation on the
raw object before `safeDecimal` would go uncaught.

## Cause

BUG-0424 added `SafeString` to three schemas that were already superseded by
the `Strict*` variants the WS parser uses, without wiring the hardened schemas
in or deleting the dead ones.

## Fix

Decide once: either wire the three schemas into the position/order/ticker WS
handlers (parse, then pass the parsed data on) and add a test covering the live
call site, or delete the three schemas plus their money test and keep only the
`Strict*` variants the parser actually uses.

Do not change any order/PnL math.

## Acceptance criteria

- [ ] No validation schema remains that is imported only by its own test.
- [ ] If kept: the position/order/ticker WS path validates through it, and a
      test covers the live call site rather than the schema in isolation.
- [ ] If deleted: `bitunixValidation.ts` and its tests contain no dangling
      references.

## Out of scope

- The wired `Strict*` schemas and the price/depth path.
- Any change to WS message normalisation or Decimal conversion.

## Links

<!-- backlog-id: BUG-0437 -->
