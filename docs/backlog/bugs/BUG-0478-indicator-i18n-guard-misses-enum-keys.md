---
id: BUG-0478
title: Indicator i18n guard misses runtime keys built from condition enums
type: bug
status: in-progress
priority: P3
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: [FEAT-0028]
assignee: claude
branch: docs/bug-0478-indicator-i18n-enum-keys
---

# BUG-0478 — Indicator i18n guard misses runtime keys built from condition enums

## Symptom

The `dashboard.alerts.indicators` subtree is rendered from a mix of catalogue
builders and enum-driven keys the Indicators tab composes inline. Only the
catalogue builders were pinned. An enum member whose translation is missing in
**both** locales renders its raw key in the panel while CI stays green.

## Evidence

**Corrected at implementation time.** The original entry claimed an AC5 guard
(`catalogueKeys()` in `src/lib/alerts/indicatorCatalogue.test.ts`) and a
whole-subtree DE/EN parity test existed and could be extended. Neither exists:

- `catalogueKeys()` appears nowhere in the repo — only in the original text of
  this entry.
- `src/lib/alerts/indicatorCatalogue.test.ts` is pure registry/WASM
  conformity; it imports no locale file.
- The only locale comparison is `scripts/validate-i18n.js` (plain Node,
  whole-file, one-directional `EN ⊆ DE`), wired to no npm script and no
  workflow. `.github/workflows/translation-check.yml` runs
  `check_translations.sh` — same whole-file parity.
- `src/locales/schema.d.ts` is a generated compile-time key union, not a runtime
  test; the tab casts its composed keys through `key(...)` to `TranslationKey`,
  so TypeScript never sees them.

So the failure class is real, but the guard the entry proposed to extend does
not exist. There was nothing to extend — the check had to be written.

The keys the tab can build at runtime:

| Family | Source of the dynamic values |
|---|---|
| `name.${id}`, `output.${o}`, `param.${p}` | `INDICATOR_CATALOGUE` |
| `group.${g}`, `groupHint.${g}` | `INDICATOR_GROUP_ORDER` |
| `op.${op}` | `ALL_COMPARE_OPS` (`indicatorConditionForm.ts`) |
| `cross.${d}` | `CROSS_DIRECTIONS` |
| `reference.${k}` | `referenceKindsFor(entry, dimensionOf(entry, output))` |
| `priceSource.${f}` | `PRICE_FIELDS` (`rules/alertPathIndicators.ts`) |
| `relationKind.{compare,cross}`, `windowAgg.{max,min}` | template literals |

## Cause

The parity check is **differential** (DE vs EN): it catches divergence — a key
in one locale and not the other. A key absent from **both** leaves the two sets
equal, so parity stays green. Nothing checked **absolute** existence. The
`key(...)` cast means the compiler does not either.

## Fix

Added `src/lib/alerts/indicatorI18n.test.ts`: an absolute guard that gathers
every key the panel can build — from the same enums the tab renders from — and
asserts each resolves in both `en.json` and `de.json`, naming the key on
failure. To share one list between tab and guard, `CROSS_DIRECTIONS` moved into
`indicatorConditionForm.ts` and is now imported by both tabs (it was duplicated
in each).

## Acceptance criteria

- [x] Removing a translation for an enum-built key from **both** locales fails
      the new test and names the key
- [x] The new test passes with the key restored
- [x] The existing catalogue-string tests and the DE/EN parity check stay green

## Links

- [`FEAT-0028`](../features/FEAT-0028-indicator-alerts.md) — origin, AC5
- `src/lib/alerts/indicatorI18n.test.ts` — the new absolute guard
- `src/lib/alerts/indicatorConditionForm.ts` — `CROSS_DIRECTIONS`, `ALL_COMPARE_OPS`
- `src/components/alerts/tabs/IndicatorsTab.svelte` — inline key sites
