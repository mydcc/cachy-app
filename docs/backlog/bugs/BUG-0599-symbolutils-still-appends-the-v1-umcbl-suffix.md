---
id: BUG-0599
title: "`normalizeSymbol` appends Bitget's decommissioned `_UMCBL` suffix for thirty callers, so every future V2 request carries a contract the venue rejects"
type: bug
status: in-progress
priority: P1
milestone: none
created: "2026-09-30"
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: []
assignee: opencode
branch: fix/bug-0599-drop-umcbl-wire-suffix
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
accepts. [`src/utils/symbolUtils.ts:60`](../../../src/utils/symbolUtils.ts):

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

## State

Investigation done, implementation not started. Branch
`fix/bug-0599-drop-umcbl-wire-suffix`, claimed by `opencode`.

**The two-line diff is the easy half; the persisted key is the real work.** The
wire side is already solved: `bitgetWireSymbol()` (`src/utils/symbolUtils.ts:90`)
strips the suffix, `toBitgetContract()` (`src/utils/server/venues/bitget.ts:365`)
strips it, and `routes/api/bitget/contracts/+server.ts:34` strips it. Removing
the append at `symbolUtils.ts:60-62` therefore closes the `40034` class, and
`bitgetWireSymbol` stays useful as the defensive strip for data written before
the change — it is not redundant.

**AC 4 has a concrete orphan instance, verified.** `tradeState.symbol` is the
normalized symbol and it is persisted: `src/stores/trade.svelte.ts:450` writes
the snapshot to `LOCAL_STORAGE_TRADE_KEY`. On reload, line 337 restores it
**raw** —

```ts
this.symbol = data.symbol;
```

— without passing through `normalizeSymbol`. So a user who had Bitget selected
resumes with `BTCUSDT_UMCBL` in `tradeState.symbol`, while every subsequent
`normalizeSymbol(sym, "bitget")` would yield `BTCUSDT`. Nothing reconciles the
two. This is a Class A store (`localStorage`), so per ADR-0001 the data is the
user's and the fix has to canonicalise it forward rather than drop it.

**Call-site audit — only the `provider === "bitget"` paths are affected.** The
majority of importers pass `"bitunix"` literally and are untouched. Affected:

- *wire / adapter boundary* — `services/exchange/bitgetAdapter.ts:93`,
  `services/api/marketData.ts:279` and `:696`, `services/bitgetWs.ts:482,532,638,664`
- *store-key lookup* — `components/inputs/TradeSetupInputs.svelte:88`,
  `services/app.ts:399`, `services/appEffects.svelte.ts:109,145`,
  `services/tradeService.ts:1785,1932,2097`, `services/calculatorService.ts:279`
- *store-key equality/precision* — `lib/calculators/tpsl.ts:332-333`,
  `AddToPositionModal:82`, `ClosePositionModal:87,101`,
  `TpSlCreateModal:118`, `TpSlEditModal:101`, `PlaceOrderPanel:134,153`,
  `ExchangeAccountControls:88`, `services/dataRepairService.ts:99`,
  `services/mdaService.ts:37`, `stores/trade.svelte.ts:474,499`
- *persisted raw restore* — `stores/trade.svelte.ts:337` (the orphan above)

In-memory stores (`marketState.data`, `symbolMeta`, `accountState`) need no
migration: the same function writes and reads them, so both sides move together.
Only persisted Class A data needs the forward canonicalisation.

**Open decision, needs a human:** whether the fix canonicalises the restored
symbol in place (`trade.svelte.ts:337`) or migrates the persisted payload on
load. The first is a one-line change confined to one store; the second also
rewrites what the user has on disk. `area: exchange` at P1, so this wants a
decision rather than an agent's guess.

## Links

- BUG-0576 — the parent migration
- BUG-0596, BUG-0597 — the signed paths that need the bare contract
- [`docs/bitget-api/09_v1_vs_v2.md`](../../bitget-api/09_v1_vs_v2.md)