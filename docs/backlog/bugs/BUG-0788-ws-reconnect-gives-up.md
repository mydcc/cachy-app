---
id: BUG-0788
title: WebSocket reconnect gives up permanently after 12 attempts during a venue-only outage
type: bug
status: in-progress
priority: P2
milestone: none
editions: [community, pro, private]
area: market
data_class: none
adr: none
depends_on: []
assignee: opencode
branch: fix/chat-cap-ws-reconnect
---

# BUG-0788 — WebSocket reconnect budget gives up (PA-10)

## Symptom

After 12 reconnect attempts (~2–3 min) the Bitunix/Bitget socket stops
permanently and waits for an explicit connect. During a venue-only outage
`navigator.onLine` stays true and the `online` event never fires, so live
prices stay dead until the trader clicks Reconnect.

## Evidence

Derived — `src/services/bitunixWs.ts` and `src/services/bitgetWs.ts`
(`scheduleReconnect`). Production audit PA-10.

## Fix

When the fast budget is exhausted, schedule a 60 s probe instead of giving up.
Each probe resets the attempt counter and reconnect delay, so a failed probe
re-enters the normal backoff cycle; the banner stays in its reconnecting /
disconnected state. The probe re-arms itself while the browser is offline.

## Verification

`src/services/bitunixWs_reconnect_budget.test.ts` and
`src/services/bitgetWs.v2.test.ts`: after exhaustion a timer exists, and
advancing 60 s resets the counter and calls connect. RED against
`origin/develop` (`expected null not to be null`), GREEN after.
