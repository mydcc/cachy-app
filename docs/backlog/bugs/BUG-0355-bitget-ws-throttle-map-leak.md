---
id: BUG-0355
title: Bitget WebSocket throttleMap is never pruned and leaks memory indefinitely
type: bug
status: done
assignee: antigravity
shipped: 1.6.0-beta.216
priority: P1
milestone: none
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: []
size: S
---

# BUG-0355 — Bitget WebSocket throttleMap is never pruned and leaks memory indefinitely

## Symptom

During long trading sessions where users browse markets, view multiple symbols, or trade different pairs, heap memory usage of the Bitget WebSocket connection grows monotonically without reclaiming memory.

## Evidence

**Derived** from code inspection and comparison with `bitunixWs.ts`:

In `src/services/bitgetWs.ts:88`:
```typescript
private throttleMap = new Map<string, number>();
```
In `src/services/bitgetWs.ts:145-160`:
```typescript
private shouldThrottle(key: string, commit = true): boolean {
  const now = Date.now();
  const last = this.throttleMap.get(key) || 0;
  if (now - last < this.UPDATE_INTERVAL) {
    return true;
  }
  if (commit) {
    this.throttleMap.set(key, now);
  }
  return false;
}
```

In contrast, `BitunixWebSocketService` (`src/services/bitunixWs.ts:178-185, 246`) explicitly defines and invokes `pruneThrottleMap()` every 10 seconds to delete all entries older than `THROTTLE_TTL` (5000ms). `BitgetWebSocketService` has no pruning logic, no TTL, and no size limit on `throttleMap`.

## Cause

Entries added to `this.throttleMap` via `shouldThrottle` or `commitThrottle` remain in the `Map` forever for the entire lifetime of the `BitgetWebSocketService` instance.

## Fix

1. Add `private readonly THROTTLE_TTL = 5000;` to `BitgetWebSocketService`.
2. Add a `private pruneThrottleMap()` method that iterates over `this.throttleMap` and deletes entries where `now - timestamp > this.THROTTLE_TTL`.
3. Call `this.pruneThrottleMap()` inside `this.globalMonitorInterval` (every 5000ms).
4. Clear `this.throttleMap` on `destroy()`.

## Evaluation

- **Umfang (Scope):** XS (approx. 15 lines of code)
- **Priorität (Priority):** P1 (Long-term session memory stability)
- **Schwierigkeit (Difficulty):** Low (exact pattern already exists in `bitunixWs.ts`)
- **Dringlichkeit (Urgency):** Medium

## Acceptance criteria

- [x] A unit test proves that keys older than `THROTTLE_TTL` are evicted from `throttleMap` by the monitor interval.
- [x] Calling `destroy()` clears all remaining keys in `throttleMap`.
- [x] Active throttle keys under 5000ms are preserved and not evicted prematurely.

## Out of scope

- Refactoring the throttling algorithm itself.
- Merging Bitunix and Bitget WebSocket services into a common base class.

## Open questions

None.

## Links

- `src/services/bitgetWs.ts:88`
- `src/services/bitunixWs.ts:178-185`
