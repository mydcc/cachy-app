---
id: BUG-0380
title: placeOrder qty is not range-clamped before the exchange gate
type: bug
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: []
assignee: claude
---

# BUG-0375 — placeOrder qty is not range-clamped before the exchange gate

## Symptom

`placeOrder` in `src/services/tradeService.ts` formats `params.qty` with
`formatApiNum` and sends it to the gate, but it never clamps the quantity
to the venue's `stepSize` / `minTradeVolume` / `maxMarketOrderVolume`
before doing so. The `displayed.stepSize`, `minTradeVolume`, and
`maxMarketOrderVolume` are passed into `gatedRequest`, but the gate
receives the raw `qty`, not a pre-clamped value.

If a user (or a bug in the calculator) produces a qty that violates the
symbol's step size or volume limits, the exchange rejects the order and
the user sees an error — after the confirmation dialog, not before. In a
fast market this produces a failed order where the UI showed a valid
position size.

## Evidence

**Derived.** Reading `src/services/tradeService.ts:1207-1278`:

- Line 1223: `qty: formatApiNum(params.qty)` — only converts to string,
  does not clamp.
- Lines 1252-1268 compute `stepSize` and volume limits from `meta`,
  pass them into `displayed` (the gate's context), but never apply them
  to `payload.qty`.
- The gate (`src/services/orderGate.ts`) has `stepSize` in its
  `DisplayedState`, but the actual `payload.qty` sent to the exchange
  bypasses clamping.

## Cause

The `placeOrder` method treats `formatApiNum` as sufficient sanitization,
but that function only controls string formatting (no scientific notation,
trimming trailing zeros). It does not enforce step-size alignment or
volume bounds. The gate's role is to *refuse* an out-of-range order,
not to correct it — so the user sees a refusal after confirming, rather
than an automatically corrected size.

## Fix

Clamp `params.qty` to the symbol's step size and volume limits before
formatting, in `placeOrder` (lines 1222-1223):

```ts
const clampedQty = clampToStepSize(params.qty, stepSize);
const payload = {
  ...
  qty: formatApiNum(clampedQty),
  ...
};
```

A simple `clampToStepSize` can round to the nearest multiple of
`stepSize` using Decimal arithmetic:

```ts
function clampToStepSize(qty: Decimal | string, stepSize: Decimal | undefined): Decimal {
  const d = new Decimal(qty);
  if (!stepSize || d.isZero()) return d;
  return d.dividedToIntegerBy(stepSize).times(stepSize);
}
```

Preserve the existing gate refusal for genuinely out-of-bounds values
(minimum / maximum volume) — only apply step-size rounding here.

## Acceptance criteria

- [ ] `placeOrder` rounds `qty` to the symbol step size before
  `formatApiNum`.
- [ ] `formatApiNum` is not used as the sole sanitization path.
- [ ] Existing gate tests still pass; add a test for step-size rounding
  in `placeOrder`.
- [ ] `npm run check` green.

## Links

- `src/services/tradeService.ts:1223` — `formatApiNum(params.qty)`
- `src/services/tradeService.ts:1252-1268` — stepSize / volume limits computed but not applied to payload
- `src/utils/utils.ts:183-195` — `formatApiNum` only formats, does not clamp
