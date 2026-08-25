---
id: BUG-0317
title: No automated WASM-to-TS parity verification or benchmark
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: calculation
data_class: none
adr: none
depends_on: [BUG-0313]
# assignee:            # required while status: in-progress (who is working this)
---

# BUG-0317 — No automated WASM-to-TS parity verification or benchmark

## Symptom

Nothing proves that the WASM engine and the TS calculator agree. The
integration test `tests/integration/wasm_parity.test.ts` is an `it.skip`
placeholder (its only live assertion is `expect(1 + 1).toBe(2)`), and no file
under `tests/benchmarks/` exercises the WASM path. Every indicator-math change
therefore ships unverified against its fallback.

## Evidence

**Demonstrated** (by reading the test files and benchmark directory):

- `tests/integration/wasm_parity.test.ts:110-121` — skipped with an honest
  post-mortem comment.
- Search across `tests/benchmarks/` finds no WASM-touching case; the in-app
  `engineBenchmark.ts` is manual-only.

## Cause

The placeholder was never revived after whatever broke it, and no benchmark
case was added when the WASM path landed.

## Fix

- Replace the mock-based placeholder with a real Node test that instantiates
  `static/wasm/technicals_wasm_bg.wasm` through the committed glue (Node
  supports WebAssembly; the glue's imports are minimal), runs a golden series
  through both engines and compares outputs as exact decimal strings.
- Cover at least: SMA/WMA/BB/Stoch family, one recursive family (EMA or MACD),
  and every family newly implemented in FEAT-0316.
- Add one vitest bench case for the WASM path sized 500 / 2000 candles under
  `tests/benchmarks/`, producing numbers that later inform the routing
  threshold decision (IDEA-0318).

## Acceptance criteria

- [ ] Parity test runs (not skipped) in CI and fails on injected divergence.
- [ ] Golden-series comparison uses exact string equality on decimal output.
- [ ] Benchmark case exists and reports timings for 500 and 2000 candles.
- [ ] `npm run check` passes.

## Out of scope

- Fixing divergences this test uncovers beyond BUG-0315/FEAT-0316 scope — new
  findings get their own items.
- Changing the engine-routing threshold itself (IDEA-0318).

## Links

- `tests/integration/wasm_parity.test.ts`, `tests/benchmarks/`
- Depends on BUG-0313 so the tested binary is the freshly built one.
