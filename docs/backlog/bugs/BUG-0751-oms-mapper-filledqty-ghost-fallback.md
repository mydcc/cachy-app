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

`filledAmount` feeds the OMS order list. A zero is indistinguishable from "this
order genuinely has no fill yet", which is the one reading a trader acts on.

## Evidence

**Derived.** `src/services/mappers.ts:153`:

```ts
filledAmount: parseDecimal(data.dealAmount || data.filledQty),
```

The fallback cannot match a documented payload:

- `mapToOMSOrder` has exactly one caller — `src/services/bitunixWs/channelDispatch.ts:285`
  and `:290` — and Bitunix sends `dealAmount` (present in both committed
  fixtures, `__fixtures__/bitunix/order.json` and `order_small_price.json`).
- Bitget never reaches this function: its WebSocket bridge normalises
  `accFillSize` into `dealAmount` itself (`src/services/bitgetWs.ts:1184`).
- `filledQty` itself appears in no Bitget generation, and the declaration that
  once carried it was removed in the BUG-0596 migration (`d842dd837`). See
  BUG-0589.

So the fallback is either dead or it converts a payload that lost `dealAmount`
into a silent `0`. Neither is a shape any venue documents.

Not demonstrated: no call path is known to deliver a payload without
`dealAmount`, which is why this is P3 and not a defect with a reproduction.

## Cause

`mapToOMSOrder(data: any)` accepts an untyped payload, so the compiler cannot
see a field that never arrives. The fallback was written "just in case" rather
than from a documented field.

## Fix

Pick one and make the type enforce it:

1. Drop the fallback — `parseDecimal(data.dealAmount)` — if `dealAmount` is the
   only name the only caller's payload carries. Preferred: a miss then reads as
   `0` only where the venue actually sent nothing, and no ghost field suggests
   support that does not exist.
2. Keep a fallback but name a field some venue documents for that payload shape,
   and type the parameter so a missing field is a compile error rather than a
   zero.

Leave `mapToOMSOrder`'s status/side mapping alone. This item is about the
traded-amount field only.

## Acceptance criteria

- [ ] `src/services/mappers.ts` no longer references `filledQty`
- [ ] A test covers `filledAmount` with `dealAmount` present and absent, and the
      absent case states the intended behaviour explicitly (zero-filled by the
      venue, not by a missing field)
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
