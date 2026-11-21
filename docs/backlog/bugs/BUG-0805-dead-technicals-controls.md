---
id: BUG-0805
title: Technicals panel ships four dead section toggles, a dead pivot display mode and a never-populated market-structure row
type: bug
status: done
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
assignee: opencode
branch: refactor/remove-dead-technicals-controls
---

# BUG-0805 — Dead Technicals controls still look live

## Symptom

The Trading tab offers four checkboxes under "Technicals" — Summary,
Oscillators, Moving Averages, Pivots — and none of them changes the Technicals
panel. The panel's real switches are the `panelSections` toggles in Settings →
Technicals, so a user who turns "Pivots" off there still sees pivots, and one
who turns it off in the Trading tab sees no change at all.

Two more surfaces are equally misleading: the panel's "Marktstruktur-Hoch/Tief"
rows can never appear, and `pivots.viewMode` (`integrated` / `separated` /
`abstract`) is stored, typed and defaulted but read by no renderer.

## Evidence

**Derived** — the defect follows from reading the code. Verified by complete
reference search on `develop` at `e63e5cb85`; every row lists every file that
mentions the name, and no row has a consumer.

- `showTechnicalsSummary`, `showTechnicalsConfluence`,
  `showTechnicalsVolatility`, `showTechnicalsOscillators`, `showTechnicalsMAs`,
  `showTechnicalsAdvanced`, `showTechnicalsSignals`, `showTechnicalsPivots` —
  eight keys whose only mentions are the `TradingTab.svelte` checkboxes, the
  `settings.svelte.ts` accessor pairs, `settings/display.svelte.ts` state,
  `settings/persistenceSchema.ts` rows, `settingsTypes.ts` type + defaults, and
  `scripts/verify_technicals_frontend.py`, which only seeds them into
  `localStorage`. Nothing reads them. The panel reads
  `indicatorState.panelSections.*`; the chart reads
  `indicatorState.<indicator>.showInChart`.
- `TechnicalsData.advanced.marketStructure` — initialised as
  `{ highs: [], lows: [] }` in `technicalsCalculator.ts` and never written
  again (`// Stub Market Structure`). The WASM path returns
  `getEmptyData()`, which has no `advanced` at all, and
  `wasmCalculator.convertResult` never sets the field; the GPU path does not
  mention it either. The panel guarded on `.highs.length > 0`, so the rows were
  unreachable in every engine.
- `IndicatorSettings.pivots.viewMode` — five mentions: the type in
  `src/types/indicators.ts`, the default in `src/stores/indicator.svelte.ts`,
  and three test/bench fixtures. No UI control, no reader.

## Cause

The `panelSections` toggles (FEAT-0345-era work) replaced the older
`showTechnicals*` settings, but the old family stayed behind: still declared,
still persisted, still rendered in one tab. `marketStructure` was scaffolded for
the panel and never implemented. `viewMode` was specified for a separated
pivot rendering that never shipped.

## Fix

Delete what cannot act:

- the four checkboxes in `TradingTab.svelte` and all eight `showTechnicals*`
  keys from the display store, the accessor pairs, the persistence schema, the
  settings type and its defaults, plus the seed entries in the verification
  script;
- the market-structure block in `TechnicalsPanel.svelte` (the `{:else if}` that
  gated the "no signals" fallback collapses to `{:else}`), the field in
  `TechnicalsData` and the empty-array initialisation, and the two locale keys
  `settings.technicals.marketStructureHigh/Low`;
- `pivots.viewMode` from the indicator settings type, its default, and the
  three bench fixtures.

Existing `localStorage` blobs keep the old keys; they are ignored on load and
dropped on the next save, so no migration step is needed.

## Acceptance criteria

- [x] No `showTechnicals*` key other than `showTechnicals` exists in the
      settings type, defaults, persistence schema or store.
- [x] `TradingTab.svelte` renders the "Technicals" master toggle and no
      section checkboxes.
- [x] `TechnicalsData["advanced"]` has no `marketStructure` field, and no
      producer initialises it.
- [x] The panel's "no signals" fallback still renders when no divergence
      exists, and the two market-structure locale keys are gone from `de.json`,
      `en.json` and `schema.d.ts`.
- [x] `IndicatorSettings["pivots"]` has no `viewMode`, and no fixture sets it.
- [x] `npm run check` reports no new errors; the settings, panel and
      calculator test suites stay green.

## Out of scope

- Drawing the panel's pivots or context levels in the chart, and naming the
  pivot type/timeframe/basis in the panel (tracked separately).
- Aligning the panel's analysis timeframe with the chart window's timeframe.
- Implementing a real market-structure read; this item only removes the row
  that could never render.

## Links

- `src/components/settings/tabs/TradingTab.svelte`
- `src/components/shared/TechnicalsPanel.svelte`
- `src/stores/settings/display.svelte.ts`, `src/stores/settings/persistenceSchema.ts`
- `src/services/technicalsTypes.ts`, `src/utils/technicalsCalculator.ts`
- `src/types/indicators.ts`
- FEAT-0766 — the context block whose rows the panel does render
