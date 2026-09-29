---
id: BUG-0589
title: Bitget `NormalizedOrder.filled` reads a field the API mirror never documents, so it is almost certainly always "0"
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: [BUG-0590]
---

<!-- Specced, not ready: AC1 ("a captured Bitget response... and the traded-amount
     field is named from it") is an open question, not a criterion — the item
     does not know whether the venue sends baseVolume, filledQty, or both, which
     is the entire point. BUG-0590 exists to produce that evidence and is the
     hard blocker. Not `depends_on: [BUG-0580]`: 0580 is the umbrella flag, and
     waiting on it would bury a concrete defect behind an abstract item. -->

# BUG-0589 — Bitget order `filled` reads `filledQty`, which the mirror never documents

## Symptom

Every Bitget order reports **zero filled**, whatever actually executed. A
partially filled Bitget order renders as if nothing had filled, and a
completed one reports `0` in the history list.

## Evidence

Derived from the repo's own API mirror and the normaliser, both read directly.

The mirror documents the traded amount as **`baseVolume`** — "Amount of coins
traded" — on order detail (`docs/bitget-api/04_trade.md:479`) and on the
pending, history and plan endpoints (`:572`, `:630`, `:685`).

The string `filledQty` appears **nowhere** in `docs/bitget-api/`.

The normaliser reads the undocumented name, in both REST paths:

- `src/utils/server/venues/bitget.ts:131` (`fetchBitgetPendingOrders`)
- `src/utils/server/venues/bitget.ts:171` (`fetchBitgetHistoryOrders`)

    filled: formatApiNum(o.filledQty) || "0",

`BitgetRawOrder` declares the field as optional (`filledQty?: string | number`)
and the interface comment concedes it is "whatever field either endpoint's raw
order carries" rather than a verified shape — so a miss is silent by
construction: `formatApiNum(undefined)` yields nothing and the `|| "0"`
fallback supplies a plausible zero.

Contrast Bitunix, which is sound: `tradeQty` is documented as "Filled quantity
(base coin)" and both partial-fill examples carry it.

## Blast radius

User-visible, on the Bitget side only:

- `OpenOrdersList.svelte:346` — the filled row is gated on
  `Number(order.filled) > 0`, so it never renders for Bitget
- `OrderHistoryList.svelte:375` — shows `0` filled
- `PositionsSidebar.svelte:900-903` — filters history to
  `Number(o.filled || 0) > 0`, which drops **every** Bitget history order from
  that view — but only while `settingsState.hideUnfilledOrders` is on, so the
  filter is a deliberate user setting rather than always-on

Not a money-path gate. `rmsService.isQuantityIncreasingModify` reads
`previousQuantity`, which comes from `amount`, not `filled` — which is also why
BUG-0588 could conclude that `amount` is the right baseline. No risk decision
depends on this value, so nothing trades incorrectly; the display is wrong.

No test pins the bug: `adapterConformance.test.ts:109` asserts `filled === "0"`
but is driven by a **WebSocket** fixture, not the REST normaliser.

## Cause

A venue field name asserted from memory rather than from the mirror — the same
class as BUG-0580, and the reason that item exists. It survived because a
missing field and a genuinely unfilled order produce the same value.

## Fix

Establish the field from a real response, then map it. In order of preference:

1. Capture a live Bitget partially-filled order response and diff it against
   `docs/bitget-api/04_trade.md` to settle whether the traded amount is
   `baseVolume` on the current endpoint, `filledQty` on the V1 endpoint, or
   both. Fix `BitgetRawOrder` and both normalisers to whatever the venue
   actually sends.
2. Until that is done, stop asserting a zero that is not measured. Either
   leave `filled` unset where the payload does not carry it, or render "unknown"
   — a Bitget partial fill must not read as "no fill", because that is the one
   reading a trader acts on.

Do **not** simply rename `filledQty` to `baseVolume` on the strength of the
mirror alone. The mirror documents V2, the normaliser may have been written
against V1, and BUG-0580 already records that these two disagree. Renaming on
paper would replace a silent zero with a second silent zero.

## Acceptance criteria

- [ ] A captured Bitget response is committed as a fixture and the traded-amount
      field is named from it, not from the docs
- [ ] The two normalisers and `BitgetRawOrder` agree with that fixture
- [ ] A test drives a partially filled Bitget order through the REST path and
      shows a non-zero `filled`; it goes red before the fix
- [ ] `PositionsSidebar`'s history filter no longer drops filled Bitget orders
- [ ] If the field cannot be established, the UI says "unknown" rather than "0",
      and `BitgetRawOrder` stops declaring a field no response is known to carry
- [ ] BUG-0580 is updated with whatever the capture settles about the V1/V2 split

## Out of scope

- Renaming the field on the strength of the mirror.  may be right, but
  renaming without a capture replaces a silent zero with a second silent zero
- The WebSocket normaliser. The three call sites above are REST; the WS path is
  a separate adapter and a separate question
- Venue-capability work, or any new Bitget endpoint support
- Backfilling historical orders. Past data is what the capture will supply

## Links

- BUG-0590 — the capture that settles which field the venue actually sends; the
  hard blocker for this item
- BUG-0580 — Bitget wire format already flagged unverified; the standing
  reminder not to guess an exchange's payload
- BUG-0581 — the sibling entry-exchange wire-format finding
- BUG-0588 — concluded `amount` (not `filled`) is the amend baseline, so this
  does not reach the risk gate; found while correcting that item's comment
- `src/utils/server/venues/bitget.ts:131,171` — the two reads
- `docs/bitget-api/04_trade.md:479` — `baseVolume`, "Amount of coins traded"
