---
id: BUG-0005
title: GPU-accelerated Choppiness writes to a field nothing reads
type: bug
status: specced
priority: P2
milestone: M0
editions: [community, pro, private]
area: indicators
data_class: none
adr: none
depends_on: []
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

- [ ] The UI read site is identified and named in this item
- [ ] A parity test asserts the GPU and WASM paths produce Choppiness at the
      same location with the same shape; it fails before the fix
- [ ] `TechnicalsData` declares whichever field wins

## Links

- [`docs/TODO.md`](../../TODO.md) item 4
- `src/services/webGpuCalculator.ts`, `src/services/wasmCalculator.ts`
