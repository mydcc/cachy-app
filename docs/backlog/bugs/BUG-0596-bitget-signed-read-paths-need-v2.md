---
id: BUG-0596
title: "Bitget signed read calls still address the decommissioned V1 API, so account, balance, positions and order lists are empty"
type: bug
status: done
priority: P0
milestone: none
created: "2026-09-30"
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: [BUG-0580, BUG-0590]
assignee: opencode
branch: fix/bug-0596-uta-signed-reads
---

# Migrate the Bitget signed read endpoints to V2

Row 2, 3, 5 and 6 of the mapping table in
[`docs/bitget-api/09_v1_vs_v2.md`](../../bitget-api/09_v1_vs_v2.md), split out of
[BUG-0576](BUG-0576-bitget-v1-api-decommissioned.md) so the read half can be
reviewed and merged without the write half. Rows 7–9 (market data) already
migrated in PR #3771; rows 1 and 4 are [BUG-0597](BUG-0597-bitget-order-write-paths-need-v2.md).

## Symptom

A Bitget account shows no balance, no positions and no orders. The position
mirror the OMS is fed from never populates, so the trader sees an empty
account even with correct credentials.

Nothing in the UI says "error" — the venue rejects the request before it looks
at a signature, and the read paths turn that rejection into an empty list.

## Evidence

**Demonstrated** for the path, **derived** for each call failing.

The V1 generation is dead. Reproducible from any unauthenticated client:

```bash
curl -s 'https://api.bitget.com/api/mix/v1/account/account?productType=umcbl'
# {"code":"30032","msg":"The V1 API has been decommissioned. Please migrate to a newer version.","data":null}
```

Verified 2026-09-30. Cachy sends that path from four call sites:

| Call | Cachy path | Call site |
|---|---|---|
| `/api/account` | `/api/mix/v1/account/account` | [`src/utils/exchange/restSigningPlan.ts:273`](../../../src/utils/exchange/restSigningPlan.ts) |
| `/api/balance` | `/api/mix/v1/account/account` | [`src/utils/exchange/restSigningPlan.ts:276`](../../../src/utils/exchange/restSigningPlan.ts) |
| `/api/positions` | `/api/mix/v1/position/allPosition` | [`src/utils/exchange/restSigningPlan.ts:277`](../../../src/utils/exchange/restSigningPlan.ts) |
| `/api/orders` pending | `/api/mix/v1/order/current` | [`src/utils/exchange/restSigningPlan.ts:295`](../../../src/utils/exchange/restSigningPlan.ts) |
| `/api/orders` history | `/api/mix/v1/order/history` | [`src/utils/exchange/restSigningPlan.ts:296`](../../../src/utils/exchange/restSigningPlan.ts) |

The query parameters are V1's too: `productType: "umcbl"` at four sites in
[`src/utils/exchange/venueQueries.ts:172`](../../../src/utils/exchange/venueQueries.ts),
`:209`, `:260`, `:282`.

`30032` is returned before signature validation, so the credential path is
never reached — that each of these calls fails in production is **derived**,
from those two facts disagreeing.

## Cause

The integration was written against V1 and never migrated. BUG-0501 found the
deprecation while fixing instrument metadata and moved exactly one call.

The migration is more than a path rewrite:

1. **Paths.** `allPosition` → `all-position` (kebab-case), `order/current` →
   `order/orders-pending`, `order/history` → `order/orders-history`,
   `productType: "umcbl"` → `"USDT-FUTURES"`.
2. **Response shapes are unknown.** V1 is no longer documented, so the parsers
   at [`src/utils/server/venues/bitget.ts:101`](../../../src/utils/server/venues/bitget.ts)
   (pending), `:139` (history), `:235` (account), `:269` (balance) and `:430`
   (positions) iterate `res.data` directly and were written against a shape
   nobody can now observe. V2's list endpoints return `entrustedList` with
   `endId` pagination, so a parser iterating `data` needs rework. **This is the
   largest unknown and the reason this item cannot be closed on documentation
   alone.**
3. **`posMode` is on the table and unread.** `GET /api/v2/mix/account/account`
   returns `posMode` (`one_way_mode` | `hedge_mode`) beside `marginMode` in the
   same object. `fetchBitgetAccount` already parses five fields out of that
   payload and never reads it.

## Fix (2026-10-04: retargeted from Classic V2 to UTA V3)

The plan above was written for Classic V2. It does not survive contact with a
real account: every current account is UTA, Classic paths answer `40085`
before the signature is checked, and UTA is regrouped (`/api/v3/account|trade|
position/*`, `category` instead of `productType`, cursor pagination). Evidence:
`docs/bitget-api/14_uta_v3.md`. What was done instead:

1. Read paths remapped to UTA (`restSigningPlan.ts`): account+balance →
   `/api/v3/account/assets`, positions → `/api/v3/position/current-position`,
   pending → `/api/v3/trade/unfilled-orders`, history →
   `/api/v3/trade/history-orders`. Writes stay on V1 until BUG-0597 ports them.
2. Query builders emit `category: "USDT-FUTURES"`; history uses `limit`
   (UTA's name; max 100, the existing clamp already holds 100) instead of
   `pageSize`, keeping `symbol`/`startTime`/`endTime`.
3. Parsers rewritten against live-observed envelopes (`data: {list, cursor}`
   on orders, `data: {list}` with `list: null` on positions, bare object on
   account) with populated entries from the vendor's documented samples. Order
   fill reads `cumExecQty` (BUG-0589); fee reads `feeDetail[0].fee`.
4. No `posMode` on the account — UTA has none. The mode arrives as `holdMode`
   per position/order, is carried on `NormalizedPosition`, and reaches
   `accountState.positionMode` through the positions lane (`hydratePositions`
   normalises `hedge_mode` → `hedge`; unknown spellings set nothing).
   `positionModes` declares `["one_way", "hedge"]`.

`holdMode` is not optional and not cosmetic: the UTA **order** schema is
mode-dependent exactly as V2's was, so [BUG-0597](BUG-0597-bitget-order-write-paths-need-v2.md)
cannot choose a request shape without it.

**Leave alone.** The refusal design. No step was completed against a guessed
wire format (BUG-0001): populated entries are transcribed from documented
samples and labelled as such in the tests, and the history query's client-side
`startTime`/`endTime` re-filtering stays — UTA's 90-day window with a 30-day
max span is not the window the client signed either. The account-settings UI
stays behind the adapter's `SUPPORTS.accountSettings` (false): declaring the
modes changes what the order port may assume, not what the UI offers — the
write formats are still unverified.

## Acceptance criteria

- [x] Query-parameter ordering settled first (BUG-0580) — for `/api/v3/*` both
      orders are accepted (control at `40009`); Cachy signs correctly as
      written. Still open for `/api/v2/*`, which no current account can reach
- [x] A test reproduces the defect and fails without the fix: 11 of 12 new
      cases fail against the pre-migration module (the 12th, the empty-body
      guard, passes both ways — it documents venue behaviour)
- [x] No `/api/mix/v1/` path in `BITGET_UPSTREAM_PATHS` / `BITGET_ORDER_PATHS`
      for the read routes; no request query contains `productType=umcbl`
- [x] Every response parser is written against a live-observed envelope, with
      the evidence in [`docs/bitget-api/14_uta_v3.md`](../../bitget-api/14_uta_v3.md)
      and the `positionModes: []` note in `INTEGRATION_STATUS.md` resolved
- [x] `bitgetCapabilities.positionModes` declares `["one_way", "hedge"]`; the
      mode reaches `accountState.positionMode` through the positions lane
      (adapted: UTA has no `posMode` on the account)
- [x] Account, balance and position reads return real data — verified live
      against `api.bitget.com` from a UTA account before the parsers were
      written
- [x] The test passes with the fix (12/12)

## Links

- BUG-0576 — the parent migration; rows 1 and 4 live in BUG-0597
- BUG-0580 — query-parameter ordering; a prerequisite for every signed read
- BUG-0590 — capture a real order response; `endId`/`entrustedList` cannot be
  confirmed without it
- BUG-0589 — `filled` reads a field the mirror never documents; it changes what
  the history parser must read
- [`docs/bitget-api/09_v1_vs_v2.md`](../../bitget-api/09_v1_vs_v2.md)
