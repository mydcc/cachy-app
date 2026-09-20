---
id: BUG-0501
title: Missing symbol metadata silently skips size rounding and every volume and leverage guard instead of refusing
type: bug
status: done
branch: fix/gate-kern-paket-c
priority: P1
milestone: none
editions: [community, pro, private]
area: calculation
data_class: none
adr: none
depends_on: []
assignee: opencode
---

# BUG-0501 — Missing symbol metadata silently skips every size guard

## Symptom

On Bitget — and on Bitunix whenever the trading-pairs request happens to fail —
the calculator hands the order path a position size that was never rounded to
the instrument's precision, never checked against its minimum or maximum order
volume, and never checked against its maximum leverage.

Nothing indicates this. The panel shows a size, a required margin and a net
loss, all of them computed as if the guards had run. The order is then either
rejected by the venue for bad precision, or accepted and truncated by the venue
in a direction Cachy did not choose and does not display.

The margin and net-loss figures shown to the trader are the pre-rounding ones in
every such case, so even a successful order was sized against numbers the trader
was never shown.

## Evidence

**Derived, from reading the code.** Every guard hangs off one optional lookup,
and the miss path is a skip rather than a refusal.

The rounding is correct when it runs, and deliberately conservative —
`src/services/calculatorService.ts:271`:

```typescript
if (meta?.basePrecision !== undefined) {
    const rounded = baseMetrics.positionSize.toDecimalPlaces(
        meta.basePrecision,
        Decimal.ROUND_DOWN,
    );
```

`ROUND_DOWN` is the right direction and BUG-0252 already taught this block to
re-derive `requiredMargin`, `netLoss` and `entryFee` from the rounded size. None
of that is in question. The defect is the `if`: when `meta` is absent the entire
block — rounding *and* the re-derivation — is skipped in silence, and the
pre-rounding size flows on.

`meta` comes from a map with exactly one writer, and the store says what it
holds — `src/stores/market.svelte.ts:64`:

```typescript
// Read-only Bitunix metadata, fetched lazily per symbol (see
// tradeService.fetchTradingPairInfo / fetchPositionTiers).
symbolMeta = $state<Record<string, TradingPairInfo>>({});
```

That writer is Bitunix-only by construction —
`src/services/tradeService.ts:836`:

```typescript
const response = await appFetch(`/api/trading-pairs?symbols=${encodeURIComponent(symbol)}`);
if (!response.ok) return;
...
const validation = BitunixTradingPairResponseSchema.safeParse(json);
```

Two consequences, and the second is the one that makes this more than a
venue-parity gap:

**Bitget has no entry at all.** The lookup key makes this structural rather than
incidental: `normalizeSymbol` is not venue-neutral —
`src/utils/symbolUtils.ts:59`:

```typescript
if (provider === "bitget" && !s.includes("_UMCBL")) {
    s = s + "_UMCBL";
}
```

so Bitget symbols live in a different key space (`BTCUSDT_UMCBL`) from the one
the map is written with. Four production call sites nevertheless look up with
the venue hardcoded to Bitunix — `calculatorService.ts:271`,
`PlaceOrderPanel.svelte:142`, `TradeSetupInputs.svelte:86`, `app.ts:395` —
while `ExchangeAccountControls.svelte:171` uses a venue-aware symbol and the
position modals key by the raw `position.symbol`. Three conventions address one
map.

**Bitunix reaches the same state on any failure.** `fetchTradingPairInfo`
returns silently on a non-OK response and on a schema mismatch. A rate limit, a
cold start where the fetch has not completed, or a response shape change all
leave `symbolMeta` empty for that symbol, and the guards skip exactly as they do
on Bitget.

The guards lost are not only the rounding. `TradingPairInfo` carries
`minTradeVolume`, `maxLimitOrderVolume`, `maxMarketOrderVolume`, `minLeverage`
and `maxLeverage` — none of which can be enforced for a symbol that has no
entry.

## Cause

Instrument metadata is modelled as an **optimisation** — something to refine the
number with when available — rather than as a **precondition** for producing an
orderable size. Optional data with an `if` around it degrades to "no guard"; a
precondition degrades to "no order". For a value that becomes an order, the
second is the only safe default.

The Bitunix coupling is the second half: the map, its fetcher, its response
schema and its key convention were all built around one venue, and the
multi-venue work (FEAT-0227's adapter registry) did not reach this map.

## Fix

Make the absence of metadata a refusal, and make the map venue-aware. In order:

1. **Refuse rather than skip.** When a limit or a rounding step cannot be
   applied because the symbol has no metadata, the calculator must not emit an
   orderable size. Surface it the way the gate already surfaces an unmeasurable
   limit — `rmsService`'s `unmeasurable()` is the established vocabulary — so
   the trader is told "precision for this symbol is not available" rather than
   shown a number that skipped its guards.
2. **Key the map by venue.** `setSymbolMeta`/`symbolMeta` should carry the venue
   alongside the symbol, so a Bitget entry cannot be missed by a Bitunix-shaped
   key and a Bitunix entry cannot be served for a Bitget symbol. Remove the four
   hardcoded `"bitunix"` lookups in favour of the active venue.
3. **Give Bitget a metadata source.** A per-adapter `fetchInstrumentInfo` behind
   the FEAT-0227 registry, normalising each venue's response into
   `TradingPairInfo`, so the schema coupling in `fetchTradingPairInfo` stops
   being the reason a second venue has no guards.
4. **Do not let a failed fetch look like a symbol without precision.**
   Distinguish "not fetched yet" from "fetched, none available" so a transient
   failure retries instead of permanently presenting an unguarded size.

Leave the `ROUND_DOWN` direction and the BUG-0252 re-derivation exactly as they
are — both are correct, and step 1 only changes what happens when they cannot
run.

Whether a Bitget order with excess precision is rejected or silently truncated
is venue behaviour this analysis did not establish. It should be determined
before the fix is designed, because it decides whether this is currently a
usability failure or a silent sizing failure on that venue.

## Acceptance criteria

- [ ] A test computes a position size for a symbol with no `symbolMeta` entry
      and asserts no orderable size is produced, and the reason is surfaced
- [ ] The test fails without the fix
- [ ] A Bitget symbol resolves its own metadata and is rounded with
      `ROUND_DOWN` to that venue's precision
- [ ] A size below `minTradeVolume` or above `maxMarketOrderVolume` is refused
- [ ] Leverage above the instrument's `maxLeverage` is refused
- [ ] A failed trading-pairs fetch is retried rather than cached as
      "no precision"
- [ ] `requiredMargin`, `netLoss` and `entryFee` always describe the size that
      will actually be ordered

## Links

- BUG-0252 — the earlier fix that made this block re-derive its money metrics,
  and which this item extends to the case where the block does not run
- `docs/backlog/features/FEAT-0227-*` — the adapter registry step 3 belongs in
- BUG-0499, BUG-0500 — the other two guards in this audit that measure less
  than they claim
