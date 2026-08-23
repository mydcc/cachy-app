---
id: BUG-0290
title: Stop-protection retry loop retries through a documented no-op placeholder
type: bug
status: ready
priority: P3
milestone: none
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: []
---

# BUG-0265 — Stop-protection retry loop retries through a documented no-op placeholder

## Symptom

`orderPlacementService.replaceStop()` (`src/services/orderPlacementService.ts:196–205`)
only logs that FEAT-0070 isn't integrated. `confirmProtection`'s retry path calls
it anyway and waits 1.2 s twice — retry theatre during a live unprotected-position
window. The final outcome is honest (`UNPROTECTED` is surfaced loudly); the delay
and warn trail in between are misleading.

## Evidence

**Demonstrated by code inspection with a log line that says so** — the placeholder
explicitly announces it does nothing; the retry loop demonstrably spends two fixed
delays on it. Runtime reproduction of harm is not needed: the wasted window is the
defect, not a wrong result.

## Cause

FEAT-0070 landed its scaffolding (the call site) before its implementation; the
retry was never short-circuited around the placeholder.

## Fix

Until [`FEAT-0070`](../features/FEAT-0070-bitunix-tpsl-placement.md) ships,
short-circuit: if protection is missing and replaceStop is unavailable, go to
`failed/unprotected` immediately instead of looping. Remove the placeholder's
fake delays. Keep the loud UNPROTECTED surfacing exactly as is.

## Acceptance criteria

- [ ] A test with protection missing asserts no 1.2 s waits occur and the final
      state is unprotected/failed — failing before the fix (timing asserted with
      fake timers)
- [ ] The success path (protection present) is unchanged

## Out of scope

Implementing actual stop replacement ([`FEAT-0070`](../features/FEAT-0070-bitunix-tpsl-placement.md)).

## Links

- `src/services/orderPlacementService.ts`
- [`FEAT-0070`](../features/FEAT-0070-bitunix-tpsl-placement.md)
- Security audit 2026-08-23, finding "stop-retry loop calls a no-op placeholder" (Low)
