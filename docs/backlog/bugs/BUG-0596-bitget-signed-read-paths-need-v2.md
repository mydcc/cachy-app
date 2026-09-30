---
id: BUG-0596
title: "Bitget signed read calls still address the decommissioned V1 API, so account, balance, positions and order lists are empty"
type: bug
status: specced
priority: P0
milestone: none
created: "2026-09-30"
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: [BUG-0580, BUG-0590]
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

## Fix

1. Read paths: remap paths and `productType`, then establish each V2 response
   shape with a live call and record what actually arrives **before** rewriting
   the parser.
2. Add `posMode` to the parsed account data and declare
   `positionModes: ["one_way", "hedge"]` in
   [`src/services/exchange/bitgetCapabilities.ts:62`](../../../src/services/exchange/bitgetCapabilities.ts),
   carrying it to the UI through the existing `accountState.positionMode` path
   the way Bitunix already does.

`posMode` is not optional and not cosmetic: the V2 **order** schema is
mode-dependent, so [BUG-0597](BUG-0597-bitget-order-write-paths-need-v2.md)
cannot choose a request shape without it. The error-code table makes the
coupling concrete — `22042` rejects a reduce-only trigger order in one-way
mode, `45021` requires the order type to match the position type in one-way
mode, `45020` refuses liquidation outside two-way mode.

**Leave alone.** The refusal design. No step may be completed against a guessed
wire format (BUG-0001), and the history query's client-side `startTime`/
`endTime` re-filtering exists because Bitget's own seven-day default is not the
window the client signed — keep that reasoning intact when the endpoint moves.

## Acceptance criteria

- [ ] Query-parameter ordering settled first (BUG-0580) — of the four Bitget
      query routes only `/api/positions` is order-sensitive, and an
      insertion-order signature would fail every signed read
- [ ] A test reproduces the defect and fails without the fix: no
      `/api/mix/v1/` path in `BITGET_UPSTREAM_PATHS` / `BITGET_ORDER_PATHS` for
      the read routes
- [ ] No request query contains `productType=umcbl`
- [ ] Every response parser is written against a shape observed in a live V2
      call, with the observed payloads recorded in
      [`docs/bitget-api/INTEGRATION_STATUS.md`](../../bitget-api/INTEGRATION_STATUS.md)
- [ ] `fetchBitgetAccount` parses `posMode`; `bitgetCapabilities.positionModes`
      declares `["one_way", "hedge"]`; the mode reaches the UI through
      `accountState.positionMode`
- [ ] The `⚠️ positionModes: []` note in `INTEGRATION_STATUS.md` is resolved
- [ ] Account, balance and position reads return real data on a Bitget account
- [ ] The test passes with the fix

## Links

- BUG-0576 — the parent migration; rows 1 and 4 live in BUG-0597
- BUG-0580 — query-parameter ordering; a prerequisite for every signed read
- BUG-0590 — capture a real order response; `endId`/`entrustedList` cannot be
  confirmed without it
- BUG-0589 — `filled` reads a field the mirror never documents; it changes what
  the history parser must read
- [`docs/bitget-api/09_v1_vs_v2.md`](../../bitget-api/09_v1_vs_v2.md)
