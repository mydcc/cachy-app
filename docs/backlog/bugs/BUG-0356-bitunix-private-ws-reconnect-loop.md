---
id: BUG-0356
title: Bitunix private WebSocket reconnect loop lacks backoff and retries infinitely every 500ms
type: bug
status: ready
priority: P1
milestone: none
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: []
size: S
---

# BUG-0356 — Bitunix private WebSocket reconnect loop lacks backoff and retries infinitely every 500ms

## Symptom

When private WebSocket credentials fail, expire, or the server closes the private endpoint, `bitunixWs` initiates a tight reconnect loop every 500ms indefinitely, consuming CPU and generating rapid failed connection spam.

## Evidence

**Derived** from `src/services/bitunixWs.ts`:

In `src/services/bitunixWs.ts:52`:
```typescript
const RECONNECT_DELAY = 500;
```

In `src/services/bitunixWs.ts:633-642`:
```typescript
} else {
  if (this.isReconnectingPrivate) return;
  this.isReconnectingPrivate = true;
  if (this.reconnectTimerPrivate) clearTimeout(this.reconnectTimerPrivate);
  this.reconnectTimerPrivate = setTimeout(() => {
    this.isReconnectingPrivate = false;
    if (!this.isDestroyed) this.connectPrivate();
  }, RECONNECT_DELAY);
}
```

In contrast, the public connection scheduler (`src/services/bitunixWs.ts:622-626`) implements exponential backoff:
```typescript
const delay = this.backoffDelay;
this.backoffDelay = Math.min(this.backoffDelay * 1.5, this.MAX_BACKOFF_DELAY);
```
The private connection scheduler never updates a backoff delay, always retrying after 500ms regardless of failure frequency.

## Cause

`scheduleReconnect("private")` always schedules `connectPrivate()` with static `RECONNECT_DELAY` (500ms) without multiplying delay or capping consecutive failed attempts.

## Fix

1. Introduce `private backoffDelayPrivate = 1000;` or share the exponential backoff mechanism.
2. Scale `backoffDelayPrivate` by 1.5x up to `MAX_BACKOFF_DELAY` (30000ms) on each failed reconnect.
3. Reset `backoffDelayPrivate` to 1000ms upon successful authentication (`login` response success).
4. If authentication explicitly fails with invalid credentials, abort autonomous reconnection until credentials change in settings.

## Evaluation

- **Umfang (Scope):** S (approx. 25 lines of code)
- **Priorität (Priority):** P1 (Rate-limit protection and resource burn)
- **Schwierigkeit (Difficulty):** Low (analogous to public backoff)
- **Dringlichkeit (Urgency):** High

## Acceptance criteria

- [ ] A test proves that consecutive failures of private WebSocket connection increment delay exponentially up to `MAX_BACKOFF_DELAY`.
- [ ] Successful authentication resets private backoff delay to its initial value.
- [ ] Clearing/destroying `bitunixWs` cancels `reconnectTimerPrivate`.

## Out of scope

- Changes to Bitget WebSocket reconnection.
- Re-architecting public WebSocket authentication.

## Open questions

None.

## Links

- [`src/services/bitunixWs.ts:52`](file:///home/pat/Dokumente/GitHub/cachy-app/src/services/bitunixWs.ts#L52)
- [`src/services/bitunixWs.ts:633-642`](file:///home/pat/Dokumente/GitHub/cachy-app/src/services/bitunixWs.ts#L633-L642)
