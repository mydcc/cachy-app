---
id: BUG-0266
title: Bitunix TP/SL rows carry no planType, so plansFor never groups them
type: bug
status: in-progress
branch: fix/bug-0257-tpsl-plan-normalization
priority: P1
milestone: M3
editions: [community, pro, private]
area: exchange
data_class: A
adr: none
depends_on: []
estimate: 2
size: S
start_date: 2026-08-23
target_date: 2026-09-20
---

# BUG-0266 — Bitunix TP/SL rows carry no `planType`, so `plansFor` never groups them

## Symptom

[`tpSlState.plansFor(symbol)`](../../../src/stores/tpsl.svelte.ts) is documented
to return the take-profit and stop-loss plans attached to a symbol. Against live
Bitunix data it returned an empty object for every symbol, because the field it
groups by does not exist on the objects it was given.

Anything asking *"does this position already have a stop?"* therefore got **no**
— including the create-vs-edit decision that
[`FEAT-0070`](../features/FEAT-0070-bitunix-tpsl-placement.md)'s third
acceptance criterion depends on, which is how this was found.

Proven before fixing: feeding the documented response row through `ensureFresh`
unchanged leaves `plansFor("BTCUSDT").profit` and `.loss` both `undefined`.

## Cause

Three things that are each defensible and disagree with each other:

1. **The venue does not send `planType`.** `GET …/tpsl/get_pending_orders`
   returns, per [`06_tp_sl.md`](../../bitunix-api/06_tp_sl.md) §Get Pending
   TP/SL Order:
   ```json
   {"id":"123","positionId":"12345678","symbol":"BTCUSDT","tpPrice":"50000",
    "tpStopType":"LAST_PRICE","slPrice":"70000","slQty":"0.01", …}
   ```
   No `planType`, and no `triggerPrice`.

2. **`fetchTpSlOrders` passed the raw rows through.** It de-duplicated and
   sorted them but never mapped them onto `TpSlOrder`'s declared shape.

3. **`planTypeOf` reads `order.planType`** and returns `null` when it is
   absent, so `plansFor` skipped every plan.

### The structural half

`TpSlOrder` models **one leg** — one `planType`, one `triggerPrice`. The venue
returns **one row carrying both**, each leg with its own stop type, order type
and quantity. No amount of defaulting reconciles those: one row has to become
zero, one or two plans depending on which legs it carries.

`updateFromWs` already did exactly this split for the WebSocket channel,
naming legs `${orderId}-tp` / `-sl`. The REST path did not, so the two halves
of the same store disagreed about what a plan is.

### Why the tests did not catch it

`tpsl.test.ts`'s `plan()` helper builds
`{orderId, symbol, planType, triggerPrice, status}` — a shape the venue never
sends. The store's logic was proven correct on input it does not receive. That
is the part most worth not repeating: the new tests build their fixture by
copying the documented response, so they fail if the split is removed.

## Fix

[`src/services/tpslNormalize.ts`](../../../src/services/tpslNormalize.ts) —
`normalizeTpSlRow` splits one venue row into one `TpSlOrder` per leg it
actually carries, and `fetchTpSlOrders` applies it on the Bitunix path.

- **Leg ids match `updateFromWs`'s scheme** (`${id}-tp` / `-sl`), so a live push
  replaces the fetched row instead of appearing beside it. A test asserts the
  list stays at two plans across a fetch followed by a push.
- **`sourceOrderId`** carries the venue's own row id. `orderId` on a normalised
  plan is a leg id this app invented, which the exchange has never heard of —
  so cancel and modify now address `sourceOrderId` first. This was the sharpest
  edge of the fix: without it, splitting the rows would have broken editing.
- **De-duplication keys on `orderId` first**, not `id`. Both legs of one row
  share the row's `id`, so the old order would have collapsed a take-profit and
  its stop into one entry — the split would have been undone immediately after
  being done.
- **Idempotent.** A row that already carries `planType` (the WS split, the
  generic non-Bitunix provider) passes through untouched, so a normalised list
  can be re-normalised without doubling.

### The one thing left as a guess

Nothing in the response says whether a row is the position-wide plan or a
partial one. The plausible signal is the quantity — a position-wide plan tracks
the position and names no size, a partial one names the size it covers — and
that is recorded as `scopeGuess`, named so it reads as the inference it is.

It is judged **per leg**, because a row can carry a sized take-profit beside an
unsized stop, and one verdict for the row would be wrong for one of them.

Safe to display. **Not safe to place an order on** until confirmed against a
live account: getting it wrong means either a refused order (visible, harmless)
or a second plan where the trader expected an edit (quiet, and the position
ends up covered twice).

## Acceptance criteria

- [x] `fetchTpSlOrders` normalises a Bitunix row into one `TpSlOrder` per leg
      present, with `planType` and `triggerPrice` from `tpPrice`/`slPrice`, and
      each leg's own quantity, stop type and order type carried across.
- [x] Leg ids agree with `updateFromWs`, so a push updates rather than appends.
- [x] `plansFor()` returns both plans for a covered symbol, proven against a
      fixture copied from the documented response.
- [x] A row with one leg produces exactly one plan, not one plan and one empty.
- [x] Cancel and modify address the venue's row id, not the invented leg id.
- [x] Position-wide versus partial is recorded as a named guess, not folded
      silently into another flag.

## Out of scope

- **Creating plans.** [`FEAT-0070`](../features/FEAT-0070-bitunix-tpsl-placement.md)'s
  transport and service layer are built and independent — they send, they do
  not read.
- **Confirming `scopeGuess` against a live account.** Needs credentials and an
  open position; tracked in FEAT-0070, which is the first consumer that would
  act on it.
- **Bitget.** Its TP/SL path is separate and not implicated.

## Links

- [`FEAT-0070`](../features/FEAT-0070-bitunix-tpsl-placement.md) — the consumer that surfaced this
- [`FEAT-0072`](../features/FEAT-0072-bitunix-tpsl-ws-channel.md) — the WS channel whose split this now matches
- [`06_tp_sl.md`](../../bitunix-api/06_tp_sl.md) — the documented response shape
- `src/services/tpslNormalize.ts` — the split
- `src/stores/tpsl.svelte.ts` — `planTypeOf`, `plansFor`, `updateFromWs`
