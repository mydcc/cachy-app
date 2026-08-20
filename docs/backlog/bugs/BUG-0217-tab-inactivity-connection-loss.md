---
id: BUG-0217
title: Tab inactivity drops WebSocket connection without automatic recovery
type: bug
status: done
priority: P1
milestone: none
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: []
start_date: 2026-08-16
target_date: 2026-08-16
size: S
estimate: 2
---


# BUG-0217 — Tab inactivity drops WebSocket connection without automatic recovery

## Symptom

When the Cachy browser tab is left inactive or in the background for an extended duration, the connection to the market data provider drops. When the user returns to the tab, the red offline banner is displayed:

> **Connection Lost**  
> Unable to reach market data provider. Your calculations and journal remain safe.  
> `Reconnect` | `Switch Provider` | `Check Settings`

The user must manually click "Reconnect" or reload the page (F5) to restore live market data and WebSocket feeds, rather than Cachy seamlessly reconnecting upon tab focus.

## Evidence

*Demonstrated* — Modern browsers (Chrome, Firefox, Safari) throttle background timers (`setInterval` / `setTimeout`) down to 1 execution per minute or suspend them entirely when a tab is inactive.
In `src/services/bitunixWs.ts`:
1. The heartbeat ping interval slows down in background tabs, leading to keepalive timeouts or silent TCP disconnections on the exchange side.
2. The monitor interval (`src/services/bitunixWs.ts` lines 298–308) checks `timeSincePublic > 25000`. When the background timer finally executes after tab sleep, `timeSincePublic` has exceeded 25 seconds, triggering:
   ```ts
   marketState.connectionStatus = "disconnected";
   this.cleanup("public");
   ```
3. Autonomous reconnect is explicitly commented out in `bitunixWs.ts` (`// We no longer trigger autonomous reconnections here`).
4. Neither `connectionManager.ts` nor `app.ts` registers a `document.addEventListener("visibilitychange", ...)` or `window.addEventListener("focus", ...)` listener to trigger auto-reconnect when returning to the tab.

## Cause

1. Background tab throttling causes keepalive timers to delay and the connection monitor to mark the socket as disconnected.
2. Missing lifecycle reaction to tab visibility (`document.visibilityState === "visible"`) and window focus events to transparently reconnect the active provider.
3. Lack of seamless reconnect / backoff strategy when the tab regains focus before prompting the user with an intrusive "Connection Lost" banner.

## Fix

**Visibility and focus listeners, centralized in `ConnectionManager` rather than
per provider.** `bitunixWs.ts` and `bitgetWs.ts` both already implement
`ManagedService` (`connect(force?)`, `destroy()`) and both already write to the
shared `marketState.connectionStatus`, so `ConnectionManager` — which already
owns provider lifecycle via `switchProvider` — is the one place that can fix
this for both providers at once instead of duplicating the logic twice. Placed
in `connectionManager.ts`'s constructor, mirroring how `bitunixWs.ts` already
registers its own `window.addEventListener("online"/"offline", ...)` there.

Two DOM event pairs feed one method, `notifyVisibilityChange(visible: boolean)`,
kept public and pure (no DOM access itself) so it can be tested without firing
real browser events:

- `document.visibilitychange`, the tab-level signal the symptom names directly.
- `window.focus`/`blur`, because a Cachy tab that stays the *active* tab while
  the whole browser *window* loses OS focus (e.g. working in another
  application on a second monitor) never fires `visibilitychange` — some
  browsers throttle background *windows* too, not only background tabs, so
  relying on one event alone would miss that case.

**Threshold instead of an unconditional reconnect on every glance away.** The
issue's own fix note said to check `connectionStatus !== "connected"` before
reconnecting, but that value is unreliable at the exact moment visibility
changes: the same background-timer throttling this bug is about can mean the
monitor loop hasn't run yet to update it, so it can still read `"connected"`
long after the socket actually died. Instead, `notifyVisibilityChange` records
when the tab/window was hidden and, on return, only forces a reconnect if it
was hidden for at least `HIDDEN_RECONNECT_THRESHOLD_MS` (15s — the same
threshold `bitunixWs`'s own monitor loop already uses for "how long is stale"
while the tab is visible). Below that, an ordinary alt-tab is a no-op: no
teardown, no resubscribe, nothing for the user to notice.

**The reconnect itself is the existing, already-proven path.** Past the
threshold, `notifyVisibilityChange` calls
`switchProvider(activeProvider, { force: true })` — the identical call
`appEffects.svelte.ts` and `app.ts` already make on an API-key change or first
load. It tears down every registered provider (`killAll()`), restarts the
polling bridge, and reconnects the active one; `onProviderConnected` then calls
`pollingService.resync()`, which is what re-establishes subscriptions — nothing
provider-specific needed adding for that, since `marketWatcher`'s registered
interest already survives a provider's `destroy()`/`connect()` cycle by design
(that's the whole reason `resync()` exists).

**Grace period:** not built as a separate mechanism. `OfflineBanner` is already
a `$derived` of `connectionStatus`, so the moment `switchProvider` completes and
`onProviderConnected` fires, the banner disappears on its own — no polling, no
timeout to tune. A brief flash while `killAll()` sets the status to
`"disconnected"` before the reconnect completes is possible on a long-hidden
tab (the same flash "Switch Provider" already causes today), which is a signal
that something happened, not something lingering.

**Web Worker heartbeat:** not built. The visibility/focus fix removes the need
for it — the socket recovering within seconds of the user returning is the
actual requirement, and nothing here depends on the ping keepalive itself
surviving the background period.

## Acceptance criteria

- [x] When an inactive background tab is refocused, Cachy automatically
      detects disconnected or stale WebSocket state and initiates reconnection
      without requiring user intervention — proven past the 15s threshold,
      not on every refocus (see Fix)
- [x] Active market data subscriptions and private channels resume streaming
      within seconds of tab refocus — via the existing `resync()` path,
      already exercised by every other `switchProvider` call
- [x] The `OfflineBanner` does not linger if auto-reconnection succeeds upon
      tab refocus — it is a `$derived` of `connectionStatus`, so it clears the
      instant `onProviderConnected` fires
- [x] Manual "Reconnect" button continues to work as expected — untouched;
      `OfflineBanner.handleReconnect` still calls `app.setupRealtimeUpdates()`
      independently

## Tests

`connectionManager.test.ts` gained an 11-test `notifyVisibilityChange` suite:
a hidden period past the threshold forces a reconnect; a brief one does not;
becoming visible without a prior hidden event is a no-op; no active provider
is a no-op; a second `visible` signal without an intervening `hidden` does not
double-reconnect; a `blur`/`focus` pair behaves identically to a
`visibilitychange` pair; and one test dispatches real
`visibilitychange`/`focus`/`blur` `Event`s against the actual singleton to
prove the constructor's `addEventListener` calls stay wired, not just the
exposed method.

Verified against the pre-fix code: reverting `connectionManager.ts` to its
prior state and re-running fails 7 of the 11 (`notifyVisibilityChange is not a
function`, and the DOM-wiring test finding nothing registered). Restored
before committing.

## Out of scope

- Multi-provider parallel active streaming (only the active provider is
  connected).
- Push notifications when the tab is completely closed.
