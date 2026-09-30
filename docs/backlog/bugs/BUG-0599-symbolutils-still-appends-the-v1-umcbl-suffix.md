---
id: BUG-0599
title: "`normalizeSymbol` appends Bitget's decommissioned `_UMCBL` suffix for thirty callers, so every future V2 request carries a contract the venue rejects"
type: bug
status: specced
priority: P1
milestone: none
created: "2026-09-30"
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: []
---

# Remove the V1 `_UMCBL` suffix from `normalizeSymbol` and audit its consumers

The identifier half of [BUG-0576](BUG-0576-bitget-v1-api-decommissioned.md),
filed on its own because it is a wide mechanical change with a silent failure
mode, and because nothing else blocks it.

## Symptom

No user-visible symptom **today** — and that is the problem. Every Bitget call
Cachy makes today either already strips the suffix on the way out (the market
paths, since PR #3771) or is broken anyway (the signed paths, see
[BUG-0596](BUG-0596-bitget-signed-read-paths-need-v2.md)).

The bug is that the helper still hands out a symbol no current Bitget endpoint
accepts. [`src/utils/symbolUtils.ts:60`](../../src/utils/symbolUtils.ts):

```ts
if (provider === "bitget" && !s.includes("_UMCBL")) {
  s = s + "_UMCBL";
}
```

V2 addresses contracts by the bare pair and answers
`40034 "Parameter BTCUSDT_UMCBL does not exist"` otherwise.

## Evidence

**Demonstrated** — the suffix is rejected by the live venue:

```bash
curl -s 'https://api.bitget.com/api/v2/mix/market/candles?symbol=BTCUSDT_UMCBL&productType=USDT-FUTURES&granularity=1m&limit=1'
# {"code":"40034","msg":"Parameter BTCUSDT_UMCBL does not exist","data":null}
```

Verified 2026-09-30. That the thirty importers are affected is **derived**:
`symbolUtils.ts` has 30 importing files, among them `bitgetAdapter.ts`,
`bitgetWs.ts`, `tradeService.ts`, `marketWatcher/*`, `stores/trade.svelte.ts`,
`lib/calculators/tpsl.ts` and a dozen components.

## Cause

The suffix was the V1 wire format, expressed in a shared helper used for three
different jobs at once:

1. **wire symbols** for Bitget requests — the V1 suffix, now wrong
2. **store keys** — `marketState.data[normSymbol]`, `accountState`, position
   identifiers
3. **display** — `formatSymbolForDisplay` already strips `_UMCBL`, so several
   callers render a symbol that came in suffixed

Those three do not have to agree. Changing the helper changes keys as well as
requests, which is why this is not a one-line deletion despite the two-line
diff.

## Fix

Remove the suffix, then **audit every consumer by job** and route each to the
right representation. The expected outcome is not "no suffix anywhere":

- wire requests use the bare contract
- store keys keep whatever the rest of the store already uses, so that no
  orphaned `_UMCBL` key is left behind in `localStorage` or in the OMS
- display keeps going through `formatSymbolForDisplay`

`formatSymbolForDisplay` should keep stripping `_UMCBL`: existing journal
entries, presets and watchlist entries were written with the suffix and are
local-first data that must keep rendering correctly. Dropping the strip would
break history the user can see.

PR #3771 already added the venue-side strip (`bitgetV2Symbol`) as a defensive
measure. It becomes redundant once this is done and should be reduced to the
plain normalization, so there is one place that decides a wire symbol.

## Acceptance criteria

- [ ] `src/utils/symbolUtils.ts` no longer appends `_UMCBL`
- [ ] Every one of the 30 importers is classified as wire / store-key /
      display, and the classification is recorded in the PR
- [ ] `formatSymbolForDisplay` still strips `_UMCBL`, so journal entries,
      presets and watchlists written before the change keep rendering
- [ ] No orphaned `_UMCBL` key is left in any store: a symbol that was written
      before the change is still found after it
- [ ] The venue-side strip in `src/utils/server/venues/bitget.ts` is reduced to
      plain normalization, or its remaining justification is documented
- [ ] Bitget order and market-data requests are unaffected (covered by the
      suites added in PR #3771)
- [ ] A test reproduces the defect and fails without the fix — `normalizeSymbol`
      returns a symbol the live API accepts

## Links

- BUG-0576 — the parent migration
- BUG-0596, BUG-0597 — the signed paths that need the bare contract
- [`docs/bitget-api/09_v1_vs_v2.md`](../bitget-api/09_v1_vs_v2.md)