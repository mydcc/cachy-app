---
id: BUG-0317
title: No automated WASM-to-TS parity verification or benchmark
type: bug
status: done
priority: P1
milestone: none
editions: [community, pro, private]
area: calculation
data_class: none
adr: none
depends_on: [BUG-0313]
assignee: opencode
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
  through both engines and compares them numerically at ≤1e-9 relative float
  tolerance (the WASM side emits decimal strings, the TS references are f64 —
  raw string equality is impossible across that boundary; exact decimal
  arithmetic is pinned by the Rust unit tests instead).
- Cover at least: SMA/WMA/BB/Stoch family, one recursive family (EMA or MACD),
  and every family newly implemented in FEAT-0316.
- Add one vitest bench case for the WASM path sized 500 / 2000 candles under
  `tests/benchmarks/`, producing numbers that later inform the routing
  threshold decision (IDEA-0318).

## Acceptance criteria

- [x] Parity test runs (not skipped) in CI and fails on injected divergence.
      A merge-order guard reports — instead of failing — when the committed
      binary predates the FEAT-0316 families.
- [x] Golden-series comparison uses numeric equality at ≤1e-9 relative float
      tolerance; exact decimal pinning lives in the Rust unit tests, including
      a streaming update()/shift() equivalence test over all families with a
      fresh-candle probe. (Wording updated during review: cross-engine string
      equality is impossible decimal-vs-f64.)
- [x] Benchmark case exists and reports timings for 500 and 2000 candles
      (~4.8 ms / ~17.5 ms per round trip).
- [x] `npm run check` passes.

## Out of scope

- Fixing divergences this test uncovers beyond BUG-0315/FEAT-0316 scope — new
  findings get their own items.
- Changing the engine-routing threshold itself (IDEA-0318).

## Links

- `tests/integration/wasm_parity.test.ts`, `tests/benchmarks/`
- Depends on BUG-0313 so the tested binary is the freshly built one.
- Branch: fix/wasm-indicator-parity

## Shipped

Merged in 1.6.0-beta.154 via #2330 (BUG-0317).
