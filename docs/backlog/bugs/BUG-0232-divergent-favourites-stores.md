---
id: BUG-0232
title: Favourites live in two stores that never agree, so Settings has no effect on what gets analysed
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: settings
data_class: A
adr: none
depends_on: []
---

# BUG-0232 — Two divergent favourites stores

## Symptom

The Market Dashboard lists every favourite from Settings, but only the first
four ever receive a score — the rest stay at 0 with grey trend cells forever.
Changing favourites in Settings does not change which symbols get analysed.

Settings also offers a toggle labelled "Analyze All Favorites" with the badge
"All Favorites" / "Top 4 Only" and a CPU-impact warning. It does nothing.

## Evidence

*Demonstrated* — reproduced by `src/stores/favorites_consolidation.test.ts`,
and confirmed in a running browser: `localStorage.cachy_favorites` held
`["BTCUSDT","ETHUSDT","SOLUSDT","LINKUSDT"]` while the dashboard rendered nine
symbols.

Two stores, two keys, two caps, two sets of consumers:

| | `favoritesState` | `settingsState.favoriteSymbols` |
|---|---|---|
| Key | `cachy_favorites` | `cachy_settings` |
| Cap | `MAX_FAVORITES = 4` | `slice(0, 12)` |
| Written by | the star button on a market tile | the symbol picker |
| Read by | `marketAnalyst`, `activeTechnicalsManager`, `+page.svelte` | `MarketDashboardModal`, `SymbolPickerView` |

`settingsState.analyzeAllFavorites` appears only in `CalculationSettings.svelte`
and in the settings store itself. No consumer reads it.

## Cause

Two independently grown features. Neither store is wrong on its own; nothing
ever reconciled them, and the analyst happened to read the smaller one.

## Fix

1. `favoritesState` becomes a view over `settingsState.favoriteSymbols`.
   `items` stays a property (getter/setter) so all existing call sites keep
   working, and because it reads a `$state` field, reactivity is unchanged.
2. `MAX_FAVORITE_SYMBOLS` is exported from the settings store — one bound,
   applied in both places.
3. One-time migration folds a pre-existing `cachy_favorites` list into the
   settings list **by union**. Both lists were user-curated and which one was
   edited last is not recoverable, so inheriting an extra favourite beats
   losing one. A migration flag prevents a symbol the user later deleted from
   being resurrected on the next start.
4. The legacy key is **not** deleted. It is the user's only copy of that data.
5. `marketAnalyst.getAnalysisScope()` reads `analyzeAllFavorites`, honouring
   the toggle the UI has been showing all along. `anyNeedsUpdate` uses the same
   scope — measuring progress against out-of-scope symbols would pin the
   scheduler to its fast path waiting on work it will never do (see BUG-0230).

## Acceptance criteria

- [x] Star button and symbol picker write to the same list
- [x] More than four favourites can be kept
- [x] The shared upper bound is still enforced
- [x] A legacy list migrates by union with nothing lost
- [x] The migration does not re-run and resurrect deleted symbols
- [x] The legacy localStorage key survives migration
- [x] `analyzeAllFavorites` off analyses the top 4; on analyses all
- [x] Out-of-scope symbols do not keep the scheduler in its fast path
- [x] Adding a favourite in Settings produces a score in the dashboard (manual)

## Out of scope

- Raising `MAX_FAVORITE_SYMBOLS` above 12 — each favourite costs a live
  subscription and an analyst slot; that is a load decision, not a cleanup.

## Links

- `docs/backlog/bugs/BUG-0230-market-analyst-fetch-storm.md`
