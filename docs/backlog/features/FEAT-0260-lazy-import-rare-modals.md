---
id: FEAT-0260
title: Dynamic-import rarely opened heavyweight modals in the root layout
type: feature
status: ready
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

# FEAT-0260 — Dynamic-import rarely opened heavyweight modals in the root layout

## Problem

`src/routes/+layout.svelte` statically imports heavyweight, usually-closed
modals: `MarketDashboardModal` (888 lines), `AlertDefinitionsModal`,
`AutoBackupRestoreModal`, `DisclaimerModal`, `OrderDetailsTooltip`. All of them
parse at startup even though they are rarely opened. Mitigation is partially in
place — `MarketDashboardModal.svelte` gates its content behind
`{#if uiState.showMarketDashboardModal}` (~L272), so the closed-state runtime
cost is low; what remains is parse/instantiate cost.

Evidence basis: static import-graph analysis (Architect review, 2026-08-23);
expected saving est. tens of KB gzipped + small TBT reduction. Ranks below the
three.js / journal / i18n items.

## Proposal

Dynamic-import the rarely-opened modals on first open; preload after idle (or
on hover) so open latency stays imperceptible. Keep `DisclaimerModal` eager —
it is the first-run legal gate. Preserve the PWA `?action=` deep-link `$effect`
behavior exactly.

## Acceptance criteria

- [ ] The named modals are no longer statically imported by `+layout.svelte`.
- [ ] Each converted modal still opens correctly, including via the
      `?action=` deep-link path.
- [ ] `DisclaimerModal` remains eagerly loaded.
- [ ] Preload-after-idle keeps perceived open latency unchanged.
- [ ] Root-layout chunk shrinks (build-output evidence).
- [ ] `npm run check` passes.

## Out of scope

- Modal redesign or moving modals onto WindowFrame (already-done items).
- Any modal content/behavior changes.

## Open questions

None.

## Links

- `src/routes/+layout.svelte`, `src/components/shared/MarketDashboardModal.svelte`
- Source: Autonomous Optimization Architect review, 2026-08-23.
