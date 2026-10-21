---
id: BUG-0725
title: Security: WebSocket frame size limits, prototype pollution guards, and worker validation
type: bug
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: security
data_class: none
adr: none
depends_on: []
---

# BUG-0725 — Security: WebSocket frame size limits, prototype pollution guards, and worker validation

## Symptom

Multiple medium/low findings in WebSocket and Web Worker code:

1. **No inbound frame size limit**: `bitunixWs.ts` and `bitgetWs.ts` parse incoming frames via `safeJsonParse` without length check. Oversized frames drive CPU/memory exhaustion.

2. **`data: z.any()` allows prototype-pollution-shaped payloads**: `BitunixWSMessageSchema` and `BitgetWSMessageSchema` use `z.any()`/`z.array(z.any())` for data. Nested `__proto__`/`constructor` keys survive validation.

3. **Web Workers trust postMessage without validation**: `aggregator.worker.ts` and `technicals.worker.ts` destructure data without type/shape validation. `technicals.worker` accesses `payload.klines.map` without null guard.

4. **Reconnection amplification**: No global rate limit or circuit breaker on reconnect attempts.

5. **Worker lifecycle gaps**: `aggregatorService` worker never terminated, timeout timer not cleared. `technicalsService` no termination on unload.

6. **Bitget public socket lacks WSS enforcement**: Constructor accepts `opts.url` without `wss://` guard for public instance.

## Evidence

**Demonstrated** — all defects follow from reading the code. Fingerprints: `websocket:frameSize:noLimit`, `websocket:validation:zAnyPrototypePollution`, `worker:postMessage:noValidation`

## Fix

1. Reject frames above 1MB before `safeJsonParse`.
2. Replace `z.any()` with recursive schema rejecting `__proto__`/`constructor`/`prototype` keys.
3. Validate message type and payload shape at worker entry; guard nulls; cap array sizes.
4. Add per-session reconnect budget/circuit breaker.
5. Add `terminate()`/`destroy()` methods and clear timers on resolve.
6. Enforce `wss://` for both private and public endpoints.

## Acceptance criteria

- [ ] Frames >1MB rejected before parsing
- [ ] No `__proto__`/`constructor`/`prototype` keys in validated WS data
- [ ] Worker payloads validated at entry
- [ ] Worker cleanup on unload/error
- [ ] WSS enforced for all socket connections
- [ ] Regression tests

## Links

Security audit run-1: `~/security-audit-skill/cachy-app/run-1/`
