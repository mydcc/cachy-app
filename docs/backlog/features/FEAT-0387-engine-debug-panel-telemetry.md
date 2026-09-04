---
id: FEAT-0387
title: Engine Debug Panel with real telemetry
type: feature
status: in-progress
assignee: claude
branch: fix/engine-debug-panel-telemetry
priority: P3
milestone: M3
editions: [community, pro, private]
area: engine
data_class: none
adr: none
depends_on: []
estimate: 1
size: S
target_date: 2026-09-12
start_date: 2026-09-04
---

GitHub issue: (no separate issue — created from review follow-up on PR #2672)

## Problem

The Engine Debug Panel (DEV-only dashboard) showed hardcoded mock telemetry.
Real engine metrics (calls, durations, errors) were only recorded by the
manual benchmark, so the stats table stayed empty during normal use and the
capability/context badges never reflected the actual device.

## Proposal

- Normal calculation path records engine metrics via
  `calculationStrategy.recordMetrics` (calls, duration, success, candle count).
- `exportTelemetry()` returns real data: capabilities from
  `capabilityDetection` (wasm/simd/gpu/sharedMemory), device context
  (lowBattery/lowMemory/isMobile), degradation-derived circuit breaker
  status (wasm lastMedian > 500ms), and engine usage percentages.
- Capability detection is async; the strategy prefetches once and exports
  from the resolved snapshot so the panel can read telemetry synchronously.

## Acceptance Criteria

- [ ] Opening the panel during chart operation shows live Calls/Avg per engine.
- [ ] Capability badges reflect the real device (wasm/simd true in modern Chromium).
- [ ] Context badges (battery/memory/mobile) never throw when battery info is
      unavailable (desktop browsers).
- [ ] Engine fallback records both the failed attempt and the successful inline
      ts run, so usage stats stay honest.
- [ ] Degradation consequence documented: a single WASM run above 500ms median
      degrades selectEngine to ts for the session.

## Out of Scope

- Automatic circuit-breaker recovery (re-probing wasm after degradation).
- Persistence of telemetry across sessions.
