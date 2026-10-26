---
id: BUG-0725
title: Security: WebSocket frame size limits, prototype pollution guards, and worker validation
type: bug
status: done
assignee: opencode
priority: P2
milestone: none
editions: [community, pro, private]
area: security
data_class: none
adr: none
depends_on: []
---

# BUG-0725 — Security: WebSocket frame size limits, prototype pollution guards, and worker validation

> **State note.** Fixed on `fix/security-ws-worker-hardening` (worktree
> `.worktrees/sec-audit-2`, PR #4367). All six findings are addressed:
>
> 1. Both sockets drop a frame above 1 MB before `safeJsonParse`, measured for
>    strings, Blob, ArrayBuffer and typed arrays; one warning per socket
>    generation.
> 2. `data` is validated by a recursive JSON guard that rejects `__proto__`,
>    `constructor` and `prototype` at any depth. The guard runs on the raw
>    input, because zod's record parser loses an own `__proto__` before a
>    refinement can see it, and it also runs before the Bitunix fast path —
>    ticker/depth/kline messages never reach the fallback schema.
> 3. Worker entry points validate type, id and payload shape (aligned SoA
>    arrays, legacy klines, UPDATE kline fields) and cap arrays at 50 000.
> 4. Reconnect budget: 12 consecutive schedules without a successful open stop
>    the loop at both services; successful open, `connect(true)`, login and
>    `destroy()` reset it.
> 5. `terminate()` on both worker managers clears pending timers, rejects
>    pending requests and terminates the thread; `pagehide` wires it up. The
>    per-request timeout is cleared when a result arrives.
> 6. Bitget enforces `wss://` for the public socket as well as the private one;
>    Bitunix already used `wss://` constants.
>
> Review round: the Bitunix `online` path now resets both budgets (it was the
> documented recovery that did not exist), private-socket exhaustion no longer
> claims the public market stream is down, the bfcache teardown re-creates the
> workers instead of silently falling back to the main thread, the legacy
> klines path validates each entry, the JSON walk is iterative with a depth cap
> (a ~20 KB deeply nested frame used to throw `RangeError`), non-plain objects
> are refused, budget charging happens after the re-entrancy guard, a
> synchronous `postMessage` throw no longer leaks pending entries, the worker
> history cache is capped at eight series, and `historyLimit` is clamped.
>
> Residuals: the reconnect budget is per service instance, not shared across
> tabs — a multi-tab user can still make one attempt per tab. A Bitget private
> socket that exhausts its budget is logged and the balance is marked
> unmeasured, but the global banner stays quiet because it describes the public
> market stream; a private-stream indicator would be a UI change. The Bitunix
> `onmessage` call sites and the worker `onmessage` call sites are covered by
> the guard-module tests rather than socket/worker-level wiring tests.
>
> Verification: 143 tests across the WS transports, schemas, frame guard,
> worker guards, workers and technicals service; `tsc --noEmit` clean; ESLint
> clean; RED proofs by reverting the frame, schema, reconnect-budget and WSS
> guards individually (the frame test pads a valid JSON message, so it cannot
> pass through `JSON.parse` throwing).

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

- [x] Frames >1MB rejected before parsing
- [x] No `__proto__`/`constructor`/`prototype` keys in validated WS data
- [x] Worker payloads validated at entry
- [x] Worker cleanup on unload/error
- [x] WSS enforced for all socket connections
- [x] Regression tests

## Links

Security audit run-1: `~/security-audit-skill/cachy-app/run-1/`
