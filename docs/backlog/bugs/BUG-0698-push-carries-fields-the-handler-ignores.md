---
id: BUG-0698
title: The TP/SL push carries the live stop type, quantity and order type, and the handler reads none of them
type: bug
status: done
priority: P2
milestone: none
created: "2026-10-18"
shipped: v1.6.0-beta.463
editions: [community, pro, private]
area: execution
data_class: none
adr: none
depends_on: []
---

# BUG-0698 — The push carries fields the handler does not read

Found while reviewing #4134 (BUG-0665). BUG-0665 made the handler *preserve*
these fields instead of dropping them, which is better than before and still
not right: the frame is the live truth about them and Cachy keeps the value it
fetched.

## Symptom

A modify that changes a stop's trigger type, its order type or its quantity is
not reflected until the next fetch (at most `MAX_AGE_MS`, 30 s). In that window
`TpSlCreateModal` prefills its trigger-type select from the stale value it read
when the modal opened, so a trader can save an edit against a type the venue no
longer uses.

Silent: nothing indicates the store is behind.

## Evidence

**Derived** from the channel document and the handler's field list.

`RawWsTpSl` (`src/stores/tpsl.svelte.ts`) declares only `event`, `orderId`,
`symbol`, `status`, `tpPrice`, `slPrice` and `positionId`. `updateFromWs` reads
exactly those.

The frame also carries, per leg, the live truth of the fields the merge now
preserves from the fetch: `tpStopType`/`slStopType`, `tpOrderType`/`slOrderType`,
`tpQty`/`slQty` and `tpOrderPrice`/`slOrderPrice`
(`docs/bitunix-api/08_websocket.md:369-378`).

Consumers of the stale values:

- `TpSlCreateModal.svelte:89-94` — `stopTypeOf(order.workingType)` prefills the
  trigger type.
- `TpSlList.svelte:218` — `order.qty || order.amount` renders the quantity column.

`orderType` is read by no TP/SL consumer anywhere in `src/`, so that half has no
visible consequence today.

## Cause

BUG-0665 changed the handler from *rebuilding* the leg out of the frame to
*merging* the frame into the stored leg. Preserving the fetched value was the
whole point for fields the frame does not carry (`scopeGuess`, `ctime`), and it
was applied to fields the frame *does* carry in the same stroke. For those, the
merge now keeps a value it should replace.

## Fix proposal

Map the per-leg frame fields onto the merged leg — `tpStopType`/`slStopType` →
`workingType`, `tpQty`/`slQty` → `qty`, `tpOrderType`/`slOrderType` →
`orderType`, `tpOrderPrice`/`slOrderPrice` → `price` — and let `...stored` cover
only what the frame cannot know.

`scopeGuess` stays derived: it is inferred from the presence of a quantity, so
it has to be recomputed from the merged `qty` rather than carried.

## Resolution (2026-10-28)

The push and the fetch now read the same per-leg fields through one function,
`readLegFields` (`src/services/tpslNormalize.ts`), so "present" means the same
thing on both paths: `undefined`, `null` and `""` are absent, `"0"` is a value.

| Frame field (per leg) | Mandatory leg field |
|---|---|
| `tpStopType` / `slStopType` | `workingType` |
| `tpOrderType` / `slOrderType` | `orderType` (now declared on `TpSlOrder`) |
| `tpQty` / `slQty` | `qty`; `scopeGuess` recomputed to `partial` |
| `tpOrderPrice` / `slOrderPrice` | `price` (the child order price, not the trigger) |

`triggerPrice` still comes from `tpPrice`/`slPrice`. Two deliberate limits:

- **Sparse frame, not snapshot.** A field the frame omits keeps the fetched
  value; only the next fetch can clear it. Omission after a "clear the
  quantity" edit therefore stays stale until the cache window expires — the
  same bound BUG-0665 accepted, now named.
- **A price is required to create, not to update.** A frame naming only
  `tpStopType` still merges into an existing leg; a frame with neither a price
  nor a stored leg is dropped, because inventing a trigger would put a stop on
  screen the venue does not hold.

`tpsl.test.ts` grew nine cases; seven fail on the pre-fix store (the field
update, the create path, the price-less merge, empty/null handling, `"0"`,
`scopeGuess`, per-leg isolation), while the BUG-0665 no-regress case passes
both ways by design. Full file: 70 passed.

## Acceptance criteria

- [x] `RawWsTpSl` declares the per-leg stop type, order type, quantity and order price
- [x] A push carrying `tpStopType` updates `workingType` on the stored leg
- [x] A push carrying `tpQty` updates `qty`, and `scopeGuess` is recomputed rather than carried
- [x] A push that omits them still leaves the fetched values in place (BUG-0665 does not regress)
- [x] The frame's field names are taken from `docs/bitunix-api/08_websocket.md`
      and recorded there as **vendor-documented, not observed** — no live frame
      exists, and the channel name itself is disputed (`tp_sl` vs `tpsl`).
      Claiming observation here would be the guess BUG-0001 forbids

## Out of scope

- The `FILLED`/terminal handling, which is BUG-0697.
- Removing `qty` from `TpSlList`'s fallback chain.

## Links

- [BUG-0665](BUG-0665-ws-push-strips-source-order-id.md) — introduced the merge this refines
- [BUG-0697](BUG-0697-a-venue-cancelled-leg-stays-resting.md) — the other finding of the same review
- [`docs/bitunix-api/08_websocket.md`](../../bitunix-api/08_websocket.md) — the frame's field list
