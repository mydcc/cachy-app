---
id: BUG-0597
title: "Bitget order placement still posts to the decommissioned V1 placeOrder, and the V2 order schema needs a split Cachy has not made"
type: bug
status: specced
priority: P0
milestone: none
created: "2026-09-30"
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: [BUG-0596, BUG-0580]
---

# Migrate the Bitget order write paths to V2

> **State note (2026-10-28).** The code work (Phases A–F) is merged. What is
> missing is live verification against the exchange, which needs a human with
> API keys — **IDEA-0620** is that protocol, and the account holder cannot place
> orders at present. The acceptance criteria were re-checked against HEAD on
> 2026-10-28 (audit below), not against the phase PRs.

Row 1 and 4 of the mapping table in
[`docs/bitget-api/09_v1_vs_v2.md`](../../bitget-api/09_v1_vs_v2.md), split out of
[BUG-0576](BUG-0576-bitget-v1-api-decommissioned.md) because this is the one
part of the migration that can **quietly move money the wrong way**.

## Retargeting (2026-10-04, Phase A recon — no writes, no keys)

This item was written for Classic V2 (`side` + `tradeSide`). Every current
account is UTA, and **UTA has no `tradeSide` request field** — it appears only
in responses, computed by the venue. The UTA split is **`side` + `posSide`**
(`15_uta_writes.md`):

| Intent (hedge) | `side` | `posSide` |
|---|---|---|
| open long | `buy` | `long` |
| close long | `sell` | `long` |
| open short | `sell` | `short` |
| close short | `buy` | `short` |

One-way: no `posSide`, close via `reduceOnly: "yes"`.

This changes the hazard shape but not the acceptance: omitting `posSide` in
hedge mode violates a documented requirement (fail-closed, unlike V2's
`tradeSide` trap — unverified until observed), while a *wrong* `posSide`
still flips instead of flattening with a `00000` on the request. "Position
returns to flat" stays the criterion; "request returned 200" proves nothing.

What Phase A settled (docs only): UTA endpoint table (place `/api/v3/trade/
place-order`, modify `/api/v3/trade/modify-order`, cancel `/api/v3/trade/
cancel-order`, cancel-all `/api/v3/trade/cancel-symbol-order`, close-all
`/api/v3/trade/close-positions`, status `/api/v3/trade/order-info`),
place-order params (`category`, `qty` in base coin, `posSide` required in
hedge, `marginMode` defaulting to `crossed`, `clientOid` regex, preset TP/SL
fields for the BUG-0503 re-eval), live instrument minimums (BTCUSDT:
minOrderQty 0.0001, minOrderAmount 5 USDT — verification costs cents on the
trader's account), per-order entries in cancel-all/close-all responses (envelope `00000`
can carry a failed leg), and no documented `clientOid` idempotency (so no
write retries until a duplicate is observed rejected).

What stays observation-gated (asked, not inferred): posSide-omission behaviour,
clientOid-resubmission behaviour, the one-way `holdMode` wire literal, funding
and fee behaviour, and whether the account's mode can be switched in futures
settings (the UTA API has no set-position-mode endpoint — mode switches in
app UI per vendor support). Plus one precondition on the account holder:
the account's current holdMode.

## Audit (2026-10-28) — proven at HEAD vs observation-gated

| Criterion | At HEAD | Where |
|---|---|---|
| Writes ride UTA | done, now pinned | `restSigningPlan.ts:309-329`; `restSigningPlan.test.ts` "bitgetUpstreamPath writes" (added today, red against a V1 row) |
| V1 fields cannot travel | done | `bitgetUtaWrites.test.ts:183-194` |
| Hedge close carries `posSide` | done, refusal test added today | `venueBodies.ts:119`; body `venueBodies.test.ts:164`, refusal `:315` |
| One-way close carries `reduceOnly` | done | `bitgetUtaWrites.test.ts:79-105` |
| `presetStop*` shape evaluated | done, refusal stays | Phase F; `src/services/exchange/bitgetCapabilities.ts:40`, pinned `exchangeAdapter.test.ts:235` |
| Close returns the position to flat | **not proven** | needs a real position (IDEA-0620 Part 2) |
| Populated order response observed | **not observed** | BUG-0590 |

**Two guards were missing a test, and are added here.**

- The close route refuses a body without `posSide` (`venueBodies.ts:119`), but
  nothing failed when that guard was removed — the existing cases either
  supplied `posSide` or tripped an earlier check. The new case asserts the
  specific `VALIDATION_ERROR` with an otherwise valid payload (non-zero amount,
  explicit `marginMode`), and was checked red with the guard removed. Note that
  the guard is also required by the payload type, so removing it fails
  `svelte-check` too; the red check was a runtime observation against the
  esbuild-stripped test build.
- No test pinned `BITGET_ORDER_PATHS` at all: both sides of the browser/server
  conformance read the same table, so a row reverted to `/api/mix/v1/…` still
  produced equal signatures. `restSigningPlan.test.ts` now asserts the four
  write rows and rejects a V1 path outright — re-introducing one fails two
  tests.

**Why no agent can close this item.** The two open criteria are observations,
not code. IDEA-0620 is the protocol for them: its Part 1 is balance-neutral but
needs paper mode, Part 2 needs a funded position. The account holder reports
(2026-10-28) that no order can be placed at present, so both wait.

**Backlog note.** IDEA-0620 declares `depends_on: [BUG-0597]`, and this item's
remaining criteria are exactly IDEA-0620's steps. The direction is right — the
protocol is the remaining work, not a prerequisite — but it means neither can
close alone, and both stay open until the trader acts: this item `specced`, the
protocol `ready` under `assignee: human`.

## Symptom

**No Bitget order can be placed or closed.** Both go through
`POST /api/mix/v1/order/placeOrder`, which the venue rejects with
`30032 "The V1 API has been decommissioned"` before it looks at a signature.

The reason this is filed as its own item rather than folded into the parent:
once the path is corrected, the **next** failure mode is not an error at all.
A request that drops one field succeeds, returns 200, and does the opposite of
what the trader asked for.

## Evidence

**Demonstrated** for the deprecation, **derived** for the rest.

```bash
curl -s -X POST 'https://api.bitget.com/api/mix/v1/order/placeOrder' \
  -H 'Content-Type: application/json' -d '{}'
# {"code":"30032","msg":"The V1 API has been decommissioned…"}
```

Verified 2026-09-30. At the time, Cachy built that body in `bitgetBodies.ts`
(`buildBitgetPlaceOrderBody`, then at `:64`), sent it from
`bitgetVenue.executeOrder` in `src/utils/server/venues/bitget.ts` (then `:68`),
and took the path from `BITGET_ORDER_PATHS` in `restSigningPlan.ts` (then
`:288-289` — `close-position` shared the row, and **the same path served both
order placement and every close**). All three are rewritten at HEAD; the audit
above names the current rows.

## Cause

**As filed, for Classic V2.** The retargeting above supersedes the field names;
this section is kept because it explains *why* a successful request can still do
the wrong thing.

V1 and V2 model the intent of an order differently.

In V1 a single `side` field carried direction *and* open-versus-close:
`open_long`, `open_short`, `close_long`, `close_short`, built by a `bitgetSide()`
helper that no longer exists in `src`. On UTA the intent travels as `side` +
`posSide` (hedge) or `side` + `reduceOnly` (one-way), built by
`buildBitgetPlaceOrderBody`.

In V2 Classic `side` carried **direction only** (`buy` | `sell`) and a separate
`tradeSide` carried the close. The correct port decomposes the V1 value
losslessly — `close_long` becomes `side: buy` + `tradeSide: close` — and:

> `tradeSide` is the field carrying the close, so a port that drops it does not
> fail. It sends a valid **open long**. The order succeeds, the position
> doubles instead of flattening, and the only signal is the size.

On UTA the same trap wears a different name: a close without `posSide` is not a
close. That is why the acceptance criterion is "the position returns to flat",
not "the request returned 200".

Two required fields the V1 body never sent: `place-order` on UTA requires
`category` (Classic said `productType`) **and** `marginMode`
(`isolated` | `crossed`), and the builder refuses a missing `marginMode` rather
than letting the venue default to cross. V1's misspelled `timInForceValue`
becomes `force` with a different value set.

## Fix

**Status: implemented in Phases A–F.** The steps below are the design record;
the audit above checks them against HEAD.

Against a **real hedge-mode account**, in this order:

1. `placeOrder` → `place-order`; add `category` and `marginMode`; rename
   `timInForceValue` → `force`.
2. Split `side` into the close-carrying field **deliberately**, with a test that
   fails if a close is ever sent without it: `tradeSide` on Classic V2, `posSide`
   on UTA hedge.
3. **One-way mode is a separate branch.** A close needs `reduceOnly: YES` with
   the transactional direction in `side`, and no `posSide`. That needs
   `holdMode` from the position/order ([BUG-0596](BUG-0596-bitget-signed-read-paths-need-v2.md))
   — it cannot be derived from the order itself.
4. `cancel-order` → `cancel-order` (kebab-case) — a rename only.
5. Re-evaluate `bitgetCapabilities.tpSlAtEntry`
   ([`:40`](../../../src/services/exchange/bitgetCapabilities.ts)) against UTA's
   `presetStop*` fields on `place-order`, with a test added *before* the value
   is flipped. This answers [BUG-0503](BUG-0503-bitget-entry-opens-a-position-that-can-never-be-protected.md).

**Leave alone.** The refusal design. Per BUG-0001 no step may be completed
against a guessed wire format — and this is the item where that rule costs the
most, because the guess that costs the most here is the one that succeeds.
`BITGET_UNSUPPORTED_PROTECTION_FIELDS` keeps refusing until step 5 gives each
field a verified shape.

## Acceptance criteria

Re-checked against HEAD 2026-10-28. Ticked means proven by code plus a test at
HEAD; the observation-gated ones stay open and name their blocker.

- [x] A test reproduces the defect and fails without the fix — no
      `/api/mix/v1/` path in `BITGET_ORDER_PATHS`
      (`src/utils/exchange/restSigningPlan.ts:309-329`, pinned by
      `restSigningPlan.test.ts` "bitgetUpstreamPath writes"; re-introducing a
      V1 row fails two tests)
- [x] No request body contains `timInForceValue` — the builder sends `force`;
      the string survives only in the refusal list that rejects V1 fields
      (`bitgetUtaWrites.test.ts:190`)
- [x] `place-order` sends the UTA category and an explicit `marginMode` — UTA's
      field is `category`, not the Classic `productType` this item was written
      with (`bitgetBodies.ts:115`, `:124`; required, never defaulted)
- [ ] A close on a **hedge-mode** account returns the position to flat,
      verified against a real position — not merely a 200 response —
      **observation-gated** (IDEA-0620 Part 2; the trader cannot place orders
      at present)
- [x] A test fails if a close is sent without its close-carrying field — on UTA
      hedge that field is `posSide`; added 2026-10-28 and proven to go red when
      the guard is removed (`venueBodies.test.ts:315`, "does not name its side")
- [x] One-way mode is handled explicitly, on its own branch — `reduceOnly`
      instead of `posSide`, plus the refusal of both at once
      (`bitgetUtaWrites.test.ts:79-105`)
- [ ] The order response shape is observed in a live V2 call and recorded, not
      taken from the documentation alone — **observation-gated**; no populated
      order response exists (BUG-0590)
- [x] `bitgetCapabilities.tpSlAtEntry` is re-evaluated against V2, with a test
      added before the value is flipped — Phase F landed the `presetStop*`
      shape with tests; the value deliberately stays `false` until a live order
      proves it (`bitgetCapabilities.ts:40-43`)
- [x] The test passes with the fix — `bitgetUtaWrites.test.ts`,
      `venueBodies.test.ts` and `restSigningPlan.test.ts`: 66 passed, 2026-10-28

## Links

- BUG-0576 — the parent migration
- BUG-0596 — supplies `posMode`, which the one-way branch needs
- BUG-0580 — query-parameter ordering, a prerequisite for the signed reads this
  depends on
- BUG-0001 — never guess an exchange's wire format for a call that moves money
- BUG-0503 — the unprotected window that `presetStop*` closes
- BUG-0514 — bulk close; the native endpoint is V1 and unreachable until this
  is fixed
- [`docs/bitget-api/09_v1_vs_v2.md`](../../bitget-api/09_v1_vs_v2.md)