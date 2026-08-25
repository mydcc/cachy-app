---
id: FEAT-0316
title: Implement MFI/VWAP/PSAR/Pivot states and proper HMA in technicals-wasm
type: feature
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

# FEAT-0316 — Implement MFI/VWAP/PSAR/Pivot states and proper HMA in technicals-wasm

## Problem

The app requests MFI, VWAP, PSAR and Pivot outputs from the WASM engine, but
the module never computes them: `mfi_states`, `vwap_states`, `psar_states`,
`pivots_state` exist as fields yet `initialize()` never populates them, so
`update()` iterates empty maps and those outputs silently stay empty while the
TS side keeps defaults. Additionally the module emits a "HMA" that skips the
outer WMA(√n) smoothing — it is not a Hull Moving Average, so whenever HMA
drives engine labels, WASM and TS disagree.

Users get silently wrong or missing indicator values depending on which engine
happens to run.

## Proposal

In `technicals-wasm/src/lib.rs`:

- Seed the four missing state families from history inside `initialize()`
  (VWAP/MFI: replay cumulative flows; PSAR: seed trend/extreme/SAR from the
  first bars; Pivots: period-based replay). The `update()` loops already
  iterate these maps.
- Implement real HMA: add the third WMA state (window √n) smoothing
  `2·WMA(n/2) − WMA(n)` in initialize-replay, update and shift.
- Mirror the TS fallback implementations (`StatefulTechnicalsCalculator` /
  `calculateIndicatorsFromArrays`) exactly — semantics are copied 1:1, this is
  not a redesign.
- Extend the Rust unit tests in the style of
  `test_initialize_and_update_are_exact` for each new family.

Verification rides on the parity test revived in BUG-0317, which must cover
every newly implemented family with exact decimal-string equality.

## Acceptance criteria

- [ ] MFI, VWAP, PSAR and Pivots produce non-empty, TS-equal output after
      initialize+update (parity test asserts exact string equality).
- [ ] HMA output equals the TS implementation's HMA (parity test).
- [ ] Each new family has a Rust unit test proving init+update exactness.
- [ ] No previously-passing indicator regresses (full targeted vitest run).
- [ ] `npm run check` passes.

## Out of scope

- New indicators not already requested by `wasmSettings`.
- Routing threshold changes (IDEA-0318 decides after benchmark data exists).
- Removing any indicator from the request set — all stay, now actually computed.

## Open questions

None blocking; semantics source is the existing TS implementation.

## Links

- `technicals-wasm/src/lib.rs` (fields ~423-429, initialize ~477-1097)
- `src/services/wasmCalculator.ts` (settings mapping)
- BUG-0317 (parity proof), BUG-0313 (fresh binary must actually load first)
