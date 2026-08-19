---
id: BUG-0005
title: GPU-accelerated Choppiness writes to a field nothing reads
type: bug
status: done
priority: P2
milestone: M0
editions: [community, pro, private]
area: indicators
data_class: none
adr: none
depends_on: []
start_date: 2026-08-01
target_date: 2026-08-13
size: XS
estimate: 1
---


# BUG-0005 — GPU-accelerated Choppiness writes to a field nothing reads

## Symptom

On the WebGPU acceleration path, the Choppiness indicator is computed and then
written somewhere nothing reads, so it silently does not update.

## Evidence

**Derived.** Full analysis: [`../../TODO.md`](../../TODO.md) item 4.

`webGpuCalculator.ts:526` calls `injectResult(result, 'CHOP', chop, closes,
'volatility')`, writing to `result.volatility['CHOP']` — a key
`TechnicalsData.volatility` does not declare. The WASM/CPU reference puts the
same indicator at `result.advanced.choppiness = { value, state }`
(`wasmCalculator.ts:320-324`) — different location, different shape.

Low severity: WebGPU is the optional acceleration path and most users run the
WASM calculator.

## Fix

Confirm what the UI actually reads, then make one side match the other. Moving
the GPU output to `result.advanced.choppiness` is the likely answer, since that
is the path most users run — but confirm rather than assume.

## Acceptance criteria

- [x] The UI read site is identified and named in this item
- [x] A parity test asserts the GPU and WASM paths produce Choppiness at the
      same location with the same shape; it fails before the fix
- [x] `TechnicalsData` declares whichever field wins

## Resolution

**RESOLVED** (2026-08-10). UI read site: `TechnicalsPanel.svelte:568-582`
reads `data.advanced.choppiness.value`/`.state` — confirming the WASM/CPU
location was the one to match, per the Fix section's guess.

`webGpuCalculator.ts`'s Choppiness branch (`calculateAll`, previously around
line 526) no longer routes through the generic `injectResult(..., 'volatility')`
helper — that helper's `'volatility'` category wrote an undeclared
`result.volatility.CHOP` key nothing read. It now writes
`result.advanced.choppiness` directly, matching `TechnicalsData.advanced.choppiness`
(`technicalsTypes.ts:159`, already declared, unchanged).

To make the two paths structurally unable to drift apart again, the
value→`{value, state}` mapping (previously duplicated inline in both
`wasmCalculator.ts` and the old `webGpuCalculator.ts` code) is now one
shared function, `deriveChoppinessState()` in `technicalsTypes.ts`, called
by both. `injectResult`'s now-dead `'volatility'` branch and its
now-inaccurate comment were removed along with the `'volatility'` member of
its `category` parameter type — nothing called it anymore once `CHOP` moved
out.

Verified by `src/services/technicalsTypes.test.ts`: unit tests on
`deriveChoppinessState`'s boundary behavior, plus a source-level regression
test asserting both `wasmCalculator.ts` and `webGpuCalculator.ts` write
Choppiness through the shared helper at `result.advanced.choppiness`, and
that `webGpuCalculator.ts` no longer calls `injectResult(..., 'CHOP')`. A
full end-to-end GPU-vs-WASM run wasn't feasible in the test environment —
`WebGpuCalculator` requires a real `navigator.gpu` device, and the rest of
the codebase mocks it wholesale for the same reason (see
`engineBenchmark.test.ts`). The state-derivation formula itself (the
38.2/61.8 thresholds) was preserved exactly as `wasmCalculator.ts` already
had it, not corrected — that formula's own correctness (it never produces
the type's `"Neutral"` state, unlike the separate pure-JS/CPU path in
`technicalsCalculator.ts:481`, which does) is a different, pre-existing
question out of scope for this location/parity bug.

## Links

- [`docs/TODO.md`](../../TODO.md) item 4
- `src/services/webGpuCalculator.ts`, `src/services/wasmCalculator.ts`
