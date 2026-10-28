---
id: BUG-0751
title: The generic OMS order mapper still falls back to filledQty, a field no venue documents
type: bug
status: specced
priority: P3
milestone: none
created: "2026-10-28"
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: []
---

# BUG-0751 — `mapToOMSOrder` falls back to `filledQty`

## Symptom

No user-visible failure has been observed. The risk is the shape BUG-0589
records for the Bitget REST readers: a field name that exists in no vendor
document served as a fallback, so a payload that loses its real field reports a
plausible `0` instead of surfacing the miss.

`filledAmount` is stored on the OMS order but currently has **no production
reader**: no component, service or store consumes it, and `omsService.getAllOrders()`
has test callers only. The risk is therefore latent — it surfaces the day a
consumer starts rendering the field, and a zero is then indistinguishable from
"this order genuinely has no fill yet".

## Evidence

**Derived.** `src/services/mappers.ts:153`:

```ts
filledAmount: parseDecimal(data.dealAmount || data.filledQty),
```

The fallback cannot match a documented payload:

- `mapToOMSOrder` has exactly one caller — `src/services/bitunixWs/channelDispatch.ts:285`
  and `:290` — and Bitunix sends `dealAmount` (present in both committed
  fixtures, `src/services/exchange/__fixtures__/bitunix/order.json` and
  `.../order_small_price.json`).
- Bitget never reaches this function: its WebSocket bridge normalises
  `accFillSize` into `dealAmount` itself (`src/services/bitgetWs.ts:1184`).
- `filledQty` itself appears in no Bitget generation, and the declaration that
  once carried it was removed in the BUG-0596 migration (`d842dd837`). See
  BUG-0589.

So the fallback matches no payload any producer emits. It is dead code that
reads as support for a venue field — which is why it is filed rather than
silently deleted.

Not demonstrated: no call path is known to deliver a payload without
`dealAmount`, which is why this is P3 and not a defect with a reproduction.

## Cause

`mapToOMSOrder(data: any)` accepts an untyped payload, so the compiler cannot
see a field that never arrives. Why the fallback was written is not recoverable
from the history — its blame lands on the squashed release commit `42abdb9b3` —
and `BitgetRawOrder.filledQty?` existed until `d842dd837`, so it may once have
mirrored a field the readers used. That is provenance, not support: no current
payload carries `filledQty`.

## Fix

Pick one and make the type enforce it:

1. Drop the fallback — `parseDecimal(data.dealAmount)`. This is
   **behaviour-preserving**: `parseDecimal` already returns `Decimal(0)` for
   `undefined`, and no producer emits `filledQty`, so every current payload maps
   identically. The benefit is deleting a name that implies support for input no
   venue sends.
2. If miss-detection is what is actually wanted, that is a separate change: map
   with `parseDecimalOrUndefined` (or log the miss) so a missing field becomes
   visible instead of a plausible zero. Type the parameter so the compiler can
   see the field.

Do not sell option 1 as adding miss-detection — it does not.

Leave `mapToOMSOrder`'s status/side mapping alone. This item is about the
traded-amount field only.

## Acceptance criteria

- [ ] `src/services/mappers.ts` no longer references `filledQty`
- [ ] A test covers `filledAmount` with `dealAmount: "0"` and with `dealAmount`
      absent, and its name records that the two are indistinguishable at this
      layer (both map to `0`)
- [ ] The Bitunix WS dispatch path is unchanged: the order still reaches
      `omsService.updateOrder` with the mapped `dealAmount`
- [ ] `npm run check` and the affected Vitest files stay green

## Out of scope

- The `any` parameter type as a whole; a wider OMS typing pass is its own item
- The Bitget REST `filled` mapping (BUG-0589 / BUG-0590), which reads
  `cumExecQty` and is a different path
- Any UI change: `filledAmount` renders what it is given

## Links

- BUG-0589 — the same ghost-field class on the Bitget REST order readers
- BUG-0590 — the capture that still has to settle Bitget's populated order shape
- `src/services/mappers.ts:153` — the fallback
- `src/services/bitunixWs/channelDispatch.ts:285` — the only caller
- `src/services/bitgetWs.ts:1184` — Bitget's `accFillSize` → `dealAmount`
