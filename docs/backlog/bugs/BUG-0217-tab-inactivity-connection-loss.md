---
id: BUG-0217
title: Tab inactivity drops WebSocket connection without automatic recovery
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: []
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

1. **Tab Visibility & Focus Listener**:
   - In `connectionManager.ts` or `app.ts`, register a `visibilitychange` and `focus` listener.
   - When `document.visibilityState === "visible"` or window gains focus:
     - Check if `marketState.connectionStatus !== "connected"` or if the last received message is older than the stale threshold.
     - Automatically attempt an immediate silent reconnect via `connectionManager.switchProvider(activeProvider, { force: true })` or provider `reconnect()`.
     - Re-sync `marketWatcher` subscriptions and refresh active klines/tickers.
2. **Grace Period for Offline Banner**:
   - Give automatic reconnect a grace window (e.g. 3–5 seconds) when the tab becomes active before flashing the `OfflineBanner` if the reconnect succeeds immediately.
3. **Web Worker Heartbeat (Optional/Hardening)**:
   - For long-term background monitoring, consider offloading ping keepalives to a Web Worker (which is not throttled like main-thread timers) or handling reconnection gracefully upon wake.

## Acceptance criteria

- [ ] When an inactive background tab is refocused, Cachy automatically detects disconnected or stale WebSocket state and initiates reconnection without requiring user intervention.
- [ ] Active market data subscriptions (`ticker`, `price`, `klines`, `depth`) and private channels (`positions`, `orders`) resume streaming within seconds of tab refocus.
- [ ] The `OfflineBanner` does not linger if auto-reconnection succeeds upon tab refocus.
- [ ] Manual "Reconnect" button continues to work as expected.

## Out of scope

- Multi-provider parallel active streaming (only the active provider is connected).
- Push notifications when the tab is completely closed.
