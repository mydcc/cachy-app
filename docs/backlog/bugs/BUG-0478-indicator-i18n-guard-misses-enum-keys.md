---
id: BUG-0478
title: Indicator i18n guard misses runtime keys built from condition enums
type: bug
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: [FEAT-0028]
---

# BUG-0478 — Indicator i18n guard misses runtime keys built from condition enums

## Symptom

The FEAT-0028 AC5 guard pins the catalogue's built keys but not the
enum-driven keys the Indicators tab composes inline in the same
`dashboard.alerts.indicators` subtree. A new enum member whose translation is
missing in **both** locales renders its raw key in the panel while CI stays
green — exactly the failure class AC5 was meant to close, for a subset of the
keys.

## Evidence

**Derived.** The guard in `src/lib/alerts/indicatorCatalogue.test.ts`
(`catalogueKeys()`) iterates only the five builders the catalogue module
exposes — `nameKey`, `outputKey`, `paramKey`, `groupKey`, `groupHintKey`
(`src/lib/alerts/indicatorCatalogue.ts:352-363`). The tab also builds keys
inline from its enums:

- `IndicatorsTab.svelte` composes `dashboard.alerts.indicators.op.${op}` at
  render time.
- The subtree carries further prefixes — `windowAgg`, `relationKind`,
  `priceSource`, `reference`, `cross` — that come from condition-form and
  sentence-builder modules, not from the five catalogue builders.

The parity test (whole-subtree DE/EN) only catches **divergence**: a key
present in one locale and absent in the other makes the sorted key sets
unequal. A key absent from **both** leaves the sets equal, and `catalogueKeys()`
never lists it, so neither new test fails.

## Cause

The AC5 guard pins the catalogue module's own output (a single, well-scoped
source of truth) but stops at its boundary. The other builders live in
different modules, so the guard does not enumerate them, and the parity check
is differential (DE vs EN) rather than absolute (a key exists in a locale at
all).

## Fix

Extend the AC5 coverage to the enum-driven builders over their enums, in both
locales, where they are built — either by folding them into `catalogueKeys()`
if they can be reached from `indicatorCatalogue.ts`, or with a small sibling
test near the tab/manifest that owns each enum. Leave the existing catalogue
pin and the whole-subtree parity test unchanged.

## Acceptance criteria

- [ ] Removing a translation for one `op`/`windowAgg`/`relationKind` enum
      member from **both** locales fails the new test and names the key
- [ ] The new test passes with the key restored
- [ ] The existing catalogue-string tests and the DE/EN parity test stay green

## Links

- [`FEAT-0028`](../features/FEAT-0028-indicator-alerts.md) — origin, AC5
- `src/lib/alerts/indicatorCatalogue.test.ts` — the guard this extends
- `src/components/alerts/tabs/IndicatorsTab.svelte` — inline `op.${op}` key