---
id: BUG-0788
title: WebSocket reconnect gives up permanently after 12 attempts during a venue-only outage
type: bug
status: done
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

After the reconnect budget is spent (12 attempts, ~165 s of backoff plus up to
10 s per hanging connect attempt on Bitunix / 5 s on Bitget) the
Bitunix/Bitget socket stopped and waited for an explicit connect. During a
venue-only outage `navigator.onLine` stays true and the `online` event never
fires, so live prices stayed dead until the trader clicked Reconnect.

## Evidence

Derived when filed; demonstrated by `src/services/bitunixWs_reconnect_budget.test.ts`
and `src/services/bitgetWs.v2.test.ts`, which are red against the unfixed
scheduler (`expected null not to be null` — no timer was armed).

## Cause

`scheduleReconnect` returned at the budget check without scheduling anything.
The only automatic recovery left was the `online` event, which a venue-side
outage does not produce.

## Fix

When the fast budget is exhausted, the scheduler arms a 60 s probe. The probe
makes **one** connection attempt and deliberately does not reset the budget: a
failed attempt reaches the exhausted branch again and arms the next probe, so
the socket keeps trying at roughly one attempt per minute. A successful open
(or an explicit `connect(true)`) resets the counter, which ends the probe cycle.

The probe:
- is re-armed from its own `try`/`catch`, so a thrown connect cannot end the
  last recovery path;
- stops with a forced warning when the connect declines to start a socket
  (entitlement revoked, key missing) instead of re-arming forever;
- stays armed while the browser is offline, in case the `online` event never
  arrives.

The exhaustion log is forced (`logger.warn(..., true)`): `logSettings.network`
is off by default, so a non-forced warn would make the transition invisible.

## Acceptance criteria

- [x] An exhausted Bitunix private budget still has a timer, and it fires after
      exactly 60 s, not on the normal 1 s backoff
- [x] The probe makes one attempt and leaves the budget exhausted, so the fast
      cycle does not restart
- [x] The Bitunix public socket is probed too
- [x] Bitget behaves the same, including the offline branch
- [x] A thrown probe re-arms instead of dying
- [x] A declined connect stops with a warning instead of re-arming

## Out of scope

- The Bitunix private socket has no terminal state for a revoked key when the
  venue closes the socket instead of answering the login frame with an error.
  It will now probe that connection once a minute indefinitely. A proper
  terminal auth state (N consecutive closes before a login ack → stop, surface,
  require `connect(true)`) is its own item.
- The private socket deliberately reports no market-data status, so PA-10 does
  not change the banner for it.
- The probe delay is not jittered; clients exhaust at different times, so the
  probes are already spread.

## Links

- `src/services/bitunixWs.ts` (`scheduleReconnect`, `scheduleExhaustedProbe`)
- `src/services/bitgetWs.ts` (`scheduleReconnect`, `scheduleExhaustedProbe`)
- BUG-0725 (the reconnect budget this revises)
