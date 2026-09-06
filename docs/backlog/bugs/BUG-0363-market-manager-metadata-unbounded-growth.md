---
id: BUG-0363
title: MarketManager symbolMeta and positionTiers records grow unbounded and ignore symbol cache eviction
type: bug
status: done
shipped: 1.6.0-beta.231
priority: P2
milestone: none
editions: [community, pro, private]
area: market
data_class: none
adr: none
depends_on: []
size: S
assignee: claude
branch: fix/2584-2587-2588-bugfixes
---

# BUG-0363 — MarketManager symbolMeta and positionTiers records grow unbounded and ignore symbol cache eviction

## Symptom

As users browse markets and query tickers over a trading session, `MarketManager.symbolMeta` and `MarketManager.positionTiers` accumulate data for every queried symbol. While `MarketManager.data` is bounded by `SymbolCache` LRU eviction (defaulting to 20 symbols), metadata and position tier dictionaries are never pruned, causing memory growth over extended sessions.

## Evidence

**Derived** from `src/stores/market.svelte.ts:66-75, 101-104`:

```typescript
symbolMeta = $state<Record<string, TradingPairInfo>>({});
positionTiers = $state<Record<string, PositionTier[]>>({});

setSymbolMeta(symbol: string, info: TradingPairInfo) {
  this.symbolMeta[symbol] = info;
}

setPositionTiers(symbol: string, tiers: PositionTier[]) {
  this.positionTiers[symbol] = tiers;
}
```

And in the constructor at lines 101–104:
```typescript
this.symbolCache = new SymbolCache((symbol: string) => {
  this.klineBufferManager.releaseSymbol(symbol);
  delete this.data[symbol];
});
```

The eviction callback only deletes `this.data[symbol]` and releases kline buffers. Neither `this.symbolMeta[symbol]` nor `this.positionTiers[symbol]` is deleted when a symbol is evicted.

## Cause

The eviction handler passed to `SymbolCache` does not clear the auxiliary state dictionaries stored in `MarketManager`.

## Fix

Update the eviction handler in `src/stores/market.svelte.ts` to also delete metadata for the evicted symbol:

```typescript
this.symbolCache = new SymbolCache((symbol: string) => {
  this.klineBufferManager.releaseSymbol(symbol);
  delete this.data[symbol];
  delete this.symbolMeta[symbol];
  delete this.positionTiers[symbol];
});
```

And clear both records in `MarketManager.clear()` / `cleanup()`.

## Evaluation

- **Umfang (Scope):** XS (approx. 5 lines of code)
- **Priorität (Priority):** P2 (Prevents slow memory creep during market browsing)
- **Schwierigkeit (Difficulty):** Low
- **Dringlichkeit (Urgency):** Low

## Acceptance criteria

- [x] Evicting a symbol via `symbolCache.enforceLimit()` deletes its corresponding entries from `marketState.symbolMeta` and `marketState.positionTiers`.
- [x] Existing functionality (fetching metadata on demand if the symbol is viewed again) remains intact.
- [x] A unit test verifies that `symbolMeta` and `positionTiers` are pruned upon eviction.

## Out of scope

- Changing how trading pair info or position tiers are fetched via REST API.

## Open questions

None.

## Links

- `src/stores/market.svelte.ts:66-75`
- `src/stores/market.svelte.ts:101-104`
- `src/stores/market/symbolCache.ts`

## Resolution

Shipped in PR #2676 (squash-merged as `3bf1e1a2`, release 1.6.0-beta.231).

- The `SymbolCache` eviction callback now deletes the evicted symbol's
  entries from `symbolMeta` and `positionTiers` (covers both
  `enforceLimit()` LRU eviction and TTL-based `cleanupStale()`).
- `destroy()` and `reset()` clear both records too; `cleanup()` was
  deliberately left untouched — it runs every 30s and blanket-clearing
  metadata there would have broken the refetch cache.
- On-demand refetch when a symbol is viewed again remains intact via
  `app.ts` (`fetchTradingPairInfo` / `fetchPositionTiers`).
- Coverage: `market.test.ts` verifies LRU eviction prunes both maps and
  keeps the remaining symbols.
