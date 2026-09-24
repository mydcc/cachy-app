---
id: BUG-0547
title: TP/SL creation actions bypass the structural order gate
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: []
---

# BUG-0547 — TP/SL creation actions bypass the structural order gate

## Symptom

A direct TP/SL creation request can leave the client without the structural order gate. A stop or target could therefore be sent without the same account, position, risk, confirmation, and audit checks that normal order placement requires.

## Evidence

**Derived.** The `/api/tpsl` route exposes `place` and `place-position` as write actions in `src/routes/api/tpsl/+server.ts:66-89`, and `TradeService` emits both actions in `src/services/tradeService.ts:2483-2502` and `:2562-2591`. The gate registry in `src/services/orderGate.ts:95-106` includes TP/SL `cancel` and `modify`, but not `place` or `place-position`. `mutatingActionOf()` returns null for omitted actions in `:109-117`, and `assertGatePass()` treats null as safe in `:1537-1604`. The normal UI path uses `orderGate.submit()`, but direct `signedRequest()` callers can bypass that path.

## Cause

The mutating-action registry is incomplete and has drifted from the write-action registry of the TP/SL route.

## Fix

Make the gate registry authoritative for every write action accepted by the order and TP/SL routes. Add parity checks so a new route action cannot be added without a corresponding structural gate classification.

## Acceptance criteria

- [ ] `mutatingActionOf()` returns `place` and `place-position` for `/api/tpsl` payloads.
- [ ] Direct signed requests for either action fail without a valid gate pass and no network request occurs.
- [ ] Valid `orderGate.submit()` calls still succeed.
- [ ] Architecture tests compare route write actions, gate actions, and the scanner registry.
- [ ] Regression tests cover both action names and the unchanged cancel/modify paths.

## Out of scope

- Exchange-specific TP/SL semantics or unsupported venue capabilities.
- Refactoring the normal UI path, which already calls `orderGate.submit()`.

## Links

- `src/services/orderGate.ts:95-117`
- `src/services/orderGate.ts:1537-1604`
- `src/routes/api/tpsl/+server.ts:66-89`
- `src/services/tradeService.ts:2483-2502`
- `src/services/tradeService.ts:2562-2591`
- Related coverage: FEAT-0011, FEAT-0070, FEAT-0229; no existing item covers the missing TP/SL action set.
