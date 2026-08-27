---
id: BUG-0314
title: WASM module traps silently on malformed input and keeps the poisoned instance
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: calculation
data_class: none
adr: none
depends_on: []
assignee: opencode
---

# BUG-0314 — WASM module traps silently on malformed input and keeps the poisoned instance

## Symptom

A single malformed candle string passed to the WASM module can trap the whole
instance: the panic hook exists but is never installed, so nothing appears in
the console; `WasmCalculator` never discards its instance afterwards, so every
subsequent call throws until page reload and the service permanently falls back
to the inline TS engine without telling anyone why.

## Evidence

**Derived** (from reading the code):

- `technicals-wasm/src/lib.rs` `shift()` parses h/l/c/v with
  `Decimal::from_str(&s).unwrap()` (four sites), while `parse_decimals` /
  `update()` deliberately use `unwrap_or(Decimal::ZERO)` — inconsistent policy.
- `set_panic_hook` in `technicals-wasm/src/utils.rs:19` has zero callers.
- `ensureLoaded` / call sites in `src/services/wasmCalculator.ts` never drop
  `this.instance` after a RuntimeError.
- `cargo clippy --target wasm32-unknown-unknown` compiles clean of correctness
  lints, so this is policy/robustness, not a current miscompile.

## Cause

Trap-on-garbage parsing plus missing panic-hook installation plus missing
instance recovery — three small gaps that compound into permanent silent
degradation.

## Fix

- Replace the four `.unwrap()` sites in `shift()` with the house policy
  (`unwrap_or(Decimal::ZERO)`) or return `Result<(), JsValue>` — pick one and
  apply consistently.
- Install the panic hook via a `#[wasm_bindgen(start)]` function so traps are
  visible in the console.
- In `ensureLoaded` (TS side): drop and recreate the instance after a
  RuntimeError instead of reusing the poisoned one.
- While touching `technicals-wasm/Cargo.toml`: complete `[profile.release]`
  (`lto = true`, `codegen-units = 1`, `strip = true`, explicit
  `panic = "abort"`); document the size delta of `opt-level = "s"` vs `"z"`
  in the PR; optionally add a guarded (`command -v wasm-opt`) `-Oz` step to
  the build script.

## Acceptance criteria

- [x] A Rust unit test feeds malformed candle strings through `shift()` and
      asserts no trap occurs (or a clean Result error path, whichever was chosen).
- [x] The panic hook is installed at module start (testable via console output
      capture or code assertion).
- [x] TS-side recovery: after a simulated RuntimeError, subsequent calls
      succeed against a fresh instance (unit test with mocked instantiation).
- [x] Release-profile flags are present; build succeeds and produced binary
      size before/after is recorded in the PR description.
- [x] `npm run check` and targeted vitests pass.

## Out of scope

- Boundary marshalling redesign (IDEA-0318).
- Indicator math changes (BUG-0315, FEAT-0316).

## Links

- `technicals-wasm/src/lib.rs` (`shift`), `technicals-wasm/src/utils.rs`
- `src/services/wasmCalculator.ts` (`ensureLoaded`)
- Related: BUG-0313 (same build scripts)
- Branch: fix/wasm-build-robustness

## Shipped

Merged in 1.6.0-beta.154 via #2329 (BUG-0314).
