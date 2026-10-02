---
id: BUG-0602
title: Hardcoded dataset labels in CandlestickChart component
type: bug
status: done
assignee: opencode
branch: fix/i18n-hardcoded-labels
priority: P3
milestone: none
editions: [community, pro, private]
area: i18n
data_class: none
adr: none
depends_on: []
---

# BUG-0602 — Hardcoded dataset labels in CandlestickChart component

## Symptom

Dataset labels within the `CandlestickChart` component use hardcoded English strings ("Wicks", "Bodies"), which bypasses the translation layer and may present English text if tooltips or legends are enabled in the future.

## Evidence

**Derived, from reading the code**

In `src/components/shared/CandlestickChart.svelte`, the `prepareChartData` function explicitly assigns hardcoded string literals:
```svelte
// src/components/shared/CandlestickChart.svelte
      datasets: [
        {
          label: "Wicks",
// ...
        {
          label: "Bodies",
```
These strings were added to the `scripts/i18n-lint.config.json` allowlist, avoiding detection by the linter.

## Cause

The chart legend and tooltips are currently disabled (set to `false` in Chart.js options), so the strings are visually hidden, leading to them being hardcoded and exempted from linting.

## Fix

Add corresponding translation keys for `Wicks` and `Bodies` to `en.json` and `de.json`. Replace the hardcoded strings in `src/components/shared/CandlestickChart.svelte` with calls to the translation store (`$_()`). Finally, remove `Wicks` and `Bodies` from the `allowlist.objectLabels` in `scripts/i18n-lint.config.json`.

## Acceptance criteria

- [x] Chart dataset labels are populated using translated strings
- [x] The `i18n-lint` configuration no longer masks `Wicks` and `Bodies`

## State

Shipped in `fix/i18n-hardcoded-labels`. The dataset labels read
`$_("candlestickPatterns.chart.wicks")` / `.bodies` inside `prepareChartData()`,
under the existing `candlestickPatterns` namespace rather than a new top-level
one. `prepareChartData()` runs from the chart `$effect` and from the theme
`MutationObserver`; a locale read there re-enters the effect, which destroys the
old chart before rebuilding it (`chart.destroy()` guards the path), so there is
no leak.

German values are `Schatten` / `Kerzen` — the pair a German chart UI reads
naturally, with the English `Wicks` / `Bodies` unchanged.

No component test covers this: the label lives inside Chart.js dataset config,
and jsdom has no canvas. `scripts/lint-i18n.js` is the guard — it fails now that
the two allowlist entries are gone.

## Links
