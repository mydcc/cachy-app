---
id: FEAT-0706
title: Unify market-analysis presets behind one shared definition
type: feature
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: A
adr: none
depends_on: []
size: S
estimate: 3
---

# FEAT-0706 — Unify market-analysis presets behind one shared definition

## Problem

Two preset systems write the same settings with different numbers, and the first
boot lands in a state that neither of them calls "balanced".

1. `marketMode` (`set marketMode` → `SettingsManager.applyMarketMode`,
   `src/stores/settings.svelte.ts:933` / `:1374`): `performance` = interval 0 s,
   news off, market activity off, top 4; `balanced` = **300 s**, news on,
   activity on, top 4; `pro` = **60 s**, news on, activity on, all favourites.
2. The Calculation panel (`presets` in
   `src/components/settings/CalculationSettings.svelte`): `light` = 300 s,
   cache 10, news off, top 4, pause on, timeframes `1h,4h`; `balanced` =
   **60 s**, cache 20, news on, top 4, pause on, timeframes `15m,1h,4h`;
   `pro` = 10 s, cache 50, news on, all favourites, pause off, timeframes
   `5m,15m,1h,4h`.

`defaultSettings` (`src/stores/settings/settingsTypes.ts`) ships 60 s, cache 20,
news on, pause on, top 4, timeframes `["1h","4h"]` — i.e. the Calculation
panel's "balanced" profile except for the timeframes (which are the `light`
profile's). But `setupFirstStart()` (`src/services/app.ts`) assigns
`settingsState.marketMode = "balanced"` on the first start; that assignment runs
the setter and `applyMarketMode` overwrites the interval with 300 s.

Observed consequence on a genuinely fresh profile (no storage): the first real
boot runs a 5-minute background analysis while the Calculation panel's own
detection (`interval === 60 && !analyzeAll && cache === 20`) reports
**"Custom"** — 300 s with cache 20 matches no preset row. The shipped 60 s value
is effectively never visible in a normal first run.

From the user's side: "Balanced" means two different things depending on which
control was touched, and touching one control silently changes what the other
panel reports.

## Proposal

One preset definition, two entry points:

1. Move the full profile definition (interval, pause-on-blur, analyse-all,
   cache size, news analysis, analysis timeframes) into one shared module
   (e.g. `src/lib/marketAnalysisPresets.ts`), typed and exported as the single
   source of truth.
2. `CalculationSettings.svelte` reads that table instead of its local literal.
3. `applyMarketMode` maps onto the same table: `performance → light`,
   `balanced → balanced`, `pro → pro`; `custom` stays a no-op. `showMarketActivity`
   remains a market-mode display toggle set alongside the profile (see open
   questions).
4. `defaultSettings` equals the `balanced` profile (see open question on
   timeframes).
5. `setupFirstStart()`'s `marketMode = "balanced"` assignment becomes
   idempotent: it must not change any shipped default. A guard test pins this.

## Acceptance criteria

- [ ] Exactly one definition of the light/balanced/pro profiles exists in
      `src/`; both the Calculation panel and `applyMarketMode` consume it, with
      no duplicated numeric literals left behind.
- [ ] `applyMarketMode("performance" | "balanced" | "pro")` produces exactly the
      matching shared profile's values for interval, pause, cache, news,
      analyse-all and timeframes.
- [ ] `defaultSettings` matches the `balanced` shared profile for those fields
      (or an intentional deviation is documented in code and pinned by a test).
- [ ] On a fresh profile, `setupFirstStart()` leaves
      `marketAnalysisInterval` at the shipped default (guard test), and the
      Calculation panel detection reports "Balanced" afterwards.
- [ ] The visible values behind the three preset buttons are unchanged for the
      user.

## Out of scope

- Redesigning the Calculation settings UI or moving it to another tab
  (FEAT-0607 territory).
- Changing which fields are persisted or how the persistence schema loads them.
- Adding presets beyond light/balanced/pro/custom.
- Changing analysis behaviour itself — only where the numbers live and how they
  are applied.

## Open questions

- **Timeframes:** adopt `balanced`'s `["15m","1h","4h"]` as the shipped default
  (more background work), or keep `["1h","4h"]` and record it as a deliberate
  deviation (then a full-equality guard test cannot be written)? This decision
  blocks `ready`.
- **`showMarketActivity`:** part of the shared profile, or a market-mode-only
  display toggle as today (it currently only moves with `marketMode`)?

## Links

- `src/stores/settings.svelte.ts` — `set marketMode` (line 933),
  `applyMarketMode` (line 1374)
- `src/components/settings/CalculationSettings.svelte` — `presets` table,
  detection `$effect`
- `src/stores/settings/settingsTypes.ts` — `defaultSettings`, `MarketMode`
- `src/services/app.ts` — `setupFirstStart()`
- Related: FEAT-0607 (harmonize settings vocabulary and placement),
  FEAT-0610 (button primitive adoption)
