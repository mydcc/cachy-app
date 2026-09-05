---
id: BUG-0383
title: Alert management UI unreachable — AlertDefinitionsModal has no entry point
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
assignee: claude
shipped: 1.6.0-beta.225
branch: fix/bug-0382-alerts-entry
---

# BUG-0383 — Alert management UI unreachable: AlertDefinitionsModal has no entry point

## Symptom

Users cannot create, edit, or view price alerts. The complete alert UI
(`AlertDefinitionsModal.svelte`) ships and renders fine — but no
component ever sets `uiState.showAlertsModal = true`, so the modal is
permanently orphaned. The alert engine (WASM `alert_exports.rs`,
`alertEngine.ts`, `alerts.svelte.ts` store) evaluates rules that the
user has no way to define.

## Evidence

**Derived by grep + git pickaxe:**

- `grep -r "showAlertsModal" src/` → only 4 hits: type declaration
  (`ui.svelte.ts:41`), state (`ui.svelte.ts:84`), lazy import in
  `+layout.svelte:81-84`, close-handler render in `+layout.svelte:542-543`.
  The only write in all of `src/` is the modal's own
  `onclose={() => (uiState.showAlertsModal = false)}` — there is no
  `= true` anywhere.
- `git log -S "showAlertsModal = true" --all` → **empty**. The opener
  never existed; the modal was orphaned from its introduction in
  `feat(alerts): implement local alert engine` (3245aa30 / d3ffaba4).
- `AlertDefinitionsModal.svelte` is the **only** importer of the alert
  store (`alertState.addAlert` / `removeAlert`) — no alternative
  creation path exists.
- i18n key `dashboard.alerts.manage` ("Alarme verwalten" / "Manage
  Alerts") is declared in `locales/schema.d.ts:306`, `en.json` and
  `de.json` but referenced nowhere — the dead label of the missing
  button.

## Cause

The alert engine landed with its store, engine, and modal wired into
the layout — but the button that opens the modal was never built (or
was removed before the feature PR merged). `showAlertsModal` also
lacks the setter-method pattern its sibling modal uses
(`toggleMarketDashboardModal(show: boolean)` at `ui.svelte.ts:417-419`).

## Fix

Smallest fix: wire one button in `LeftControlPanel.svelte` (the fixed
left icon rail that already holds Dashboard/Settings/Academy openers).

1. `src/stores/ui.svelte.ts` — add setter method, mirroring the
   existing pattern:

   ```ts
   toggleAlertsModal(show: boolean) {
     this.showAlertsModal = show;
   }
   ```

2. `src/components/shared/LeftControlPanel.svelte` — add a bell-icon
   button next to the Settings button:

   ```svelte
   <button
     class="control-btn"
     onclick={() => uiState.toggleAlertsModal(true)}
     title={$_("dashboard.alerts.manage")}
     use:trackClick={{ category: "Navigation", action: "Click", name: "OpenAlerts" }}
   >
     {@html ICONS.alerts}
   </button>
   ```

   (Bell SVG added to the local `ICONS` object, style-consistent with
   the other entries.)

3. No change to `+layout.svelte` — modal wiring already exists
   (lazy import lines 81-84, render + close lines 542-543).

This also revives the dead i18n key `dashboard.alerts.manage` (DE/EN
already present; `check-translations` stays green).

## Out of scope

- No changes to the alert engine, store, or modal content.
- No additional entry points (Market Dashboard toolbar, AnalyticsButton).
- No alarm-rule feature work (that is the FEAT-0035 substrate from
  PR #2640).

## Acceptance criteria

- [x] Button visible in left control panel; opens `AlertDefinitionsModal`.
- [x] Modal closes via its existing close handler.
- [x] Alerts created in the modal reach `alertState` and are evaluated
      by the alert engine (manual smoke test).
- [x] `dashboard.alerts.manage` referenced in code (no longer a dead key).
- [x] No hardcoded colors (CSS var / paired class reuse from `control-btn`).

## Links

- `src/components/alerts/AlertDefinitionsModal.svelte` — orphaned UI
- `src/stores/ui.svelte.ts:84,417-419` — state + sibling setter pattern
- `src/routes/+layout.svelte:81-84,542-543` — existing modal wiring
- `src/components/shared/LeftControlPanel.svelte:51-77` — button placement
- `src/locales/en.json:319` / `de.json:319` — dead key `dashboard.alerts.manage`
