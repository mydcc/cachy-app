---
id: BUG-0599
title: "`normalizeSymbol` appends Bitget's decommissioned `_UMCBL` suffix for thirty callers, so every future V2 request carries a contract the venue rejects"
type: bug
status: done
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

- [x] `src/utils/symbolUtils.ts` no longer appends `_UMCBL`
- [x] Every one of the 30 importers is classified as wire / store-key /
      display, and the classification is recorded in the PR
- [x] `formatSymbolForDisplay` still strips `_UMCBL`, so journal entries,
      presets and watchlists written before the change keep rendering
- [x] No orphaned `_UMCBL` key is left in any store: a symbol that was written
      before the change is still found after it
- [x] The venue-side strip in `src/utils/server/venues/bitget.ts` is reduced to
      plain normalization, or its remaining justification is documented
- [x] Bitget order and market-data requests are unaffected (covered by the
      suites added in PR #3771)
- [x] A test reproduces the defect and fails without the fix — `normalizeSymbol`
      returns a symbol the live API accepts

## State

Shipped in `fix/bug-0599-drop-umcbl-wire-suffix`.

`normalizeSymbol` now **strips** `_UMCBL` instead of appending it. Stripping
rather than merely not-appending is what makes the change one canonical key per
contract: a symbol arriving already suffixed from a payload written before this
change converges on the same key everything else uses. The `provider` argument is
retained (every caller passes it and it reads as intent at the call site) but is
no longer consulted, so it is renamed `_provider` per the repo's ESLint
`argsIgnorePattern`.

**Only one real call-site change was needed.** In-memory stores are written and
read by the same function, so both sides move together and need no migration.
The single exception was the persisted key: `tradeState.symbol` is restored raw
at `trade.svelte.ts:337`, so a snapshot written before this change resumed as
`BTCUSDT_UMCBL` while every later lookup yielded `BTCUSDT`. That line now
canonicalizes on the way in. The empty provider argument there is deliberate and
commented — the snapshot carries no venue and pulling in `settingsState` would
invert the store dependency.

**Three tests lost their premise and were replaced, not deleted.** BUG-0501
isolated venues by key shape: a Bitget fetch did not touch the Bitunix-shaped
key. With one canonical key that separation is impossible by construction, so
`does not serve a Bitunix entry for a Bitget symbol`, its mirror in
`calculatorService.metaGuards.test.ts`, and the closing assertion of
`normalises a V2 contracts row into TradingPairInfo` were asserting a property
that is now unsatisfiable. They are replaced by a test that pins what replaced
them — one seeded entry serves both venues, which fails if anyone reintroduces
per-venue key shapes.

**Boundary strips deliberately kept.** `bitgetV2Symbol` and `bitgetWireSymbol`
both still strip. They are no longer compensating for this app's own helper;
they are the last-point guarantee for symbols that arrive from outside the store
— the tickers route query string, a chart timeframe, a persisted payload. Their
justifications now say so, and `formatSymbolForDisplay` keeps its strip because
journal entries, presets and watchlists written before this change are Class A
data the user can still see.

**Not verified here:** that Bitget itself accepts every symbol shape the app now
produces end to end. The `40034` evidence is from 2026-09-30 and predates this
change; the signed paths that would exercise it are BUG-0596 and BUG-0597.

## Links

- BUG-0576 — the parent migration
- BUG-0596, BUG-0597 — the signed paths that need the bare contract
- [`docs/bitget-api/09_v1_vs_v2.md`](../../bitget-api/09_v1_vs_v2.md)