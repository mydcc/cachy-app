---
id: FEAT-0600
title: Serve Bitget mark-price candles from the V2 kline endpoint
type: feature
status: specced
priority: P3
milestone: none
created: "2026-09-30"
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: []
---

# Serve Bitget mark-price candles from V2's `kLineType: mark`

Found while migrating the market-data paths in
[BUG-0576](../bugs/BUG-0576-bitget-v1-api-decommissioned.md): the capability Bitget
refuses today became a one-line change once the endpoint is on V2.

## Symptom

A mark-price chart request for Bitget is **refused** rather than answered.
[`src/utils/server/venues/bitget.ts:570`](../../../src/utils/server/venues/bitget.ts)
declares `supportsMarkKlines: false`, so the klines route turns the request into
an error instead of returning last-price candles wearing a mark label.

That refusal was correct under V1, where the last-price endpoint served both and
a separate mark endpoint was unwired. It is no longer the whole story.

## Evidence

**Demonstrated** — V2 serves mark candles on the same path Cachy already calls:

```bash
curl -s 'https://api.bitget.com/api/v2/mix/market/candles?symbol=BTCUSDT&productType=USDT-FUTURES&granularity=1m&limit=1&kLineType=mark'
# {"code":"00000","msg":"success","requestTime":1790785744453,
#  "data":[["1790785740000","84327.4","84327.4","84316","84319.8","0","0"]]}
```

Verified 2026-09-30. The last two fields are zero for a mark series, which is
consistent with the tuple layout the last-price series uses and means the
existing parser applies unchanged.

## Cause

Not a defect — a capability left unwired when the only working endpoint was V1.

## Fix

Pass `kLineType: mark` on the mark request and flip `supportsMarkKlines` to
`true`. The interval map, symbol handling and candle parser are the ones PR
#3771 already put on V2 and need no change.

The refusal must stay in place until the flag flips *and* a test covers the
distinction — a mark request answered with last-price data is worse than a
refusal, because nothing downstream can tell them apart.

## Acceptance criteria

- [ ] A test reproduces the defect and fails without the fix — a Bitget mark
      request is currently refused
- [ ] The mark request sends `kLineType: mark` on `/api/v2/mix/market/candles`
- [ ] `supportsMarkKlines` is `true` and a mark chart request returns candles
- [ ] A test asserts a mark series is not silently answered with last-price data
- [ ] [`docs/bitget-api/INTEGRATION_STATUS.md`](../../bitget-api/INTEGRATION_STATUS.md)
      moves the `kLineType: mark` row from ❌ to ✅
- [ ] The test passes with the fix

## Links

- BUG-0576 — the parent migration; rows 7–9 landed in PR #3771 and revealed this
- BUG-0512 — stale mark price outranking a fresh REST price, the reason mark
  candles matter here
- [`docs/bitget-api/INTEGRATION_STATUS.md`](../../bitget-api/INTEGRATION_STATUS.md)