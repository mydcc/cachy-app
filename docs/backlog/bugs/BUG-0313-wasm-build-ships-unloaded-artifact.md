---
id: BUG-0313
title: WASM build ships an artifact that production never loads
type: bug
status: in-progress
priority: P1
milestone: none
editions: [community, pro, private]
area: build
data_class: none
adr: none
depends_on: []
assignee: opencode
---

# BUG-0313 — WASM build ships an artifact that production never loads

## Symptom

Rust changes to `technicals-wasm/` do not reach the running app. The build
script produces `static/wasm/technicals_wasm.wasm` (fresh, Aug 22, ~880 KB),
but every live loader fetches `/wasm/technicals_wasm_bg.wasm` — the older
committed wasm-pack pair from Aug 15 (~430 KB). Any Rust edit since Aug 15 is
silently invisible in production.

## Evidence

**Demonstrated** (on-disk artifact inspection, no runtime repro required):

- `scripts/build_wasm.sh` copies the cargo output to
  `static/wasm/technicals_wasm.wasm`.
- Live consumers pass the other filename:
  `src/services/wasmCalculator.ts:80-81` and
  `src/services/alertEngine/alertEngine.ts:67-68` load
  `/wasm/technicals_wasm_bg.wasm`, matching the committed glue default at
  `static/wasm/technicals_wasm.js:459`.
- Both binaries exist side by side in `static/wasm/` with different dates and
  sizes (430 KB vs 880 KB).
- The only reference to the fresh file is the dead loader
  `src/utils/wasmTechnicals.ts:47-49` (see Out of scope / related cleanup in
  this same fix).

## Cause

Two generations of loader/binary naming coexist (hand-written wasm-pack pair
vs. raw cargo artifact), and the build script writes a third combination that
no consumer reads.

## Fix

- Have `scripts/build_wasm.sh` copy the freshly built binary to
  `technicals_wasm_bg.wasm` as well (export signatures currently match the
  committed glue/d.ts — verified before this item was specced).
- Extend `scripts/inspect_wasm.mjs` into an ABI-drift gate: compare the
  exports of both binaries against the names the committed glue/d.ts expect,
  so future drift fails loudly instead of silently.
- Remove the dead twin loaders (`src/utils/wasmTechnicals.ts`,
  `src/utils/WasmTechnicalsCalculator.ts`) so exactly one loading path remains;
  resolve the corresponding `docs/TODO.md` section if one tracks them.

## Acceptance criteria

- [ ] After `bash scripts/build_wasm.sh`, both `static/wasm/technicals_wasm.wasm`
      and `static/wasm/technicals_wasm_bg.wasm` contain the fresh build
      (same byte size).
- [ ] An ABI-drift check fails when a built binary's exports do not match the
      glue/d.ts expectations, and passes on the current tree.
- [ ] No source file under `src/` references the removed dead loaders anymore.
- [ ] Targeted vitest suites touching `wasmCalculator` / alert engine still
      pass; `npm run check` passes.

## Out of scope

- Regenerating glue via wasm-bindgen-cli / wasm-pack pipeline (future work,
  separate decision).
- Any change to indicator math (BUG-0315) or release profile (BUG-0314).

## Links

- `scripts/build_wasm.sh`, `scripts/inspect_wasm.mjs`
- `src/services/wasmCalculator.ts`, `src/services/alertEngine/alertEngine.ts`
- `docs/TODO.md` (dead-loader section)
- Related: BUG-0314, BUG-0315, BUG-0317
- Branch: fix/wasm-build-robustness
