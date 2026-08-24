---
id: BUG-0250
title: OfflineBanner buttons are unresponsive and non-functional when connection is lost
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: []
start_date: 2026-08-21
target_date: 2026-08-21
size: S
estimate: 2
---

# BUG-0250 — OfflineBanner buttons are unresponsive and non-functional when connection is lost

## Symptom

When the top connection alert banner ("Connection Lost — Unable to reach market data provider. Your calculations and journal remain safe.") is displayed, clicking the action buttons (`Reconnect`, `Switch Provider`, `Check Settings`) does not produce any visible UI reaction or successful reconnection.

## Evidence & Root Cause Analysis

Investigation of `src/components/shared/OfflineBanner.svelte` and related services reveals three distinct root causes:

### 1. `Reconnect` button calls `app.setupRealtimeUpdates()` instead of reconnecting
* **Current implementation:** `handleReconnect` calls `app.setupRealtimeUpdates()`.
* **Issue:** `app.setupRealtimeUpdates()` only (re)creates the Svelte `$effect.root` boundary for reactive settings/trade-state effects. It does **not** invoke `connectionManager.switchProvider(activeProvider, { force: true })` or trigger a reconnect on existing WebSocket adapters (`bitunixWs`/`bitgetWs`). If `settingsState` hasn't changed, `setupRealtimeUpdates()` does nothing.
* **Fix required:** `handleReconnect` should call `connectionManager.switchProvider(settingsState.apiProvider || "bitunix", { force: true })` directly.

### 2. `Switch Provider` button triggers a silent state update without UI feedback or error handling
* **Current implementation:** `handleSwitchProvider` toggles `settingsState.apiProvider` between `"bitget"` and `"bitunix"` and calls `app.setupRealtimeUpdates()`.
* **Issue:** While changing `settingsState.apiProvider` triggers the `$effect` in `appEffects.svelte.ts` to call `connectionManager.switchProvider`, if both providers are unreachable (e.g. user is offline or API keys are missing/invalid), the connection attempt fails silently back to `"disconnected"` or `"error"`. The user sees no loading indicator, toast message, or feedback explaining why the provider switch didn't restore connection.
* **Fix required:** Provide visual loading state or toast feedback during provider switches, or navigate to settings if credentials/network are missing.

### 3. `Check Settings` button uses hash navigation (`window.location.hash = "#settings"`) which is unhandled in modal-based navigation
* **Current implementation:** `handleSettings` sets `window.location.hash = "#settings"`.
* **Issue:** Cachy's Settings page is managed as a modal via `uiState.toggleSettingsModal(true)` (or `uiState.openWindow("settings")`). Hash navigation (`#settings`) is not listened to by Cachy's router/layout to open the settings modal, rendering the button completely non-responsive.
* **Fix required:** Update `handleSettings` to invoke `uiState.toggleSettingsModal(true)` (or `uiState.openWindow("settings")`).

## Acceptance Criteria

- [x] Clicking **Reconnect** triggers an immediate forced connection attempt via `connectionManager.switchProvider(..., { force: true })`.
- [x] Clicking **Switch Provider** toggles the active API provider, attempts reconnection, and provides clear visual feedback or toast error if switching fails.
- [x] Clicking **Check Settings** correctly opens the Settings modal (`uiState.toggleSettingsModal(true)`).
- [x] Automated unit tests for `OfflineBanner.svelte` verify button click handlers trigger expected service/store calls.

## What shipped

Shipped in 1.6.0-beta.108.
