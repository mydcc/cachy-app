---
id: FEAT-0367
title: Offload WASM technicals calculations and boundary string serialization to Web Worker
type: feature
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: indicators
data_class: none
adr: none
depends_on: []
size: M
---

# FEAT-0367 — Offload WASM technicals calculations and boundary string serialization to Web Worker

## Problem

When `settingsState.technicalsEngine` is set to `"wasm"`, technical indicators are computed via `technicals_wasm.js`. However, unlike the JS fallback engine which delegates to `technicals.worker.ts`, the WASM path executes directly on the **browser main thread** (`src/services/technicalsService.ts:222-226`).

Furthermore, in `src/services/wasmCalculator.ts:252-267`, initializing and calculating technicals for a 500–1000 candle history converts all numbers into thousands of string allocations (`closes.push(k.close.toString())`, etc.) and serializes JSON settings on the main thread across the wasm-bindgen boundary. This produces noticeable main-thread hitching and garbage collection pressure when switching timeframes or loading historical data.

## Proposal

1. Move the WASM indicator runtime and wasm-bindgen initialization into a dedicated Web Worker (either unifying `technicals.worker.ts` to host both JS and WASM, or a dedicated `technicals-wasm.worker.ts`).
2. Pass candle arrays as typed numeric buffers (`Float64Array`) or structured objects to the worker, offloading string conversion and JSON parsing entirely from the main thread.
3. Keep the main thread responsive for user interactions (pan/zoom on charts, trade execution).

## Evaluation

- **Umfang (Scope):** M (Worker architecture, WASM asset loading inside worker, async message passing)
- **Priorität (Priority):** P2 (Protects UI 60fps frame rate and prevents input lag during indicator re-computation)
- **Schwierigkeit (Difficulty):** Medium
- **Dringlichkeit (Urgency):** Medium

## Acceptance criteria

- [ ] WASM technical indicator calculations execute inside a Web Worker without blocking the main UI thread.
- [ ] No regression in indicator outputs (RSI, MACD, Bollinger Bands, ATR, Supertrend) between Worker-WASM and main thread.
- [ ] Fallback to pure JS worker remains functional if WASM fails to compile or instantiate.

## Out of scope

- Rewriting the underlying Rust mathematical algorithms in `technicals-wasm/`.

## Open questions

- Should `technicals.worker.ts` dynamically import the WASM module if supported, or should we keep two distinct worker files?
- Does Vite's WASM loader support `import.meta.url` cleanly inside nested workers in production build across all browsers?

## Links

- [`src/services/wasmCalculator.ts:252-267`](file:///home/pat/Dokumente/GitHub/cachy-app/src/services/wasmCalculator.ts#L252-L267)
- [`src/services/technicalsService.ts:222-226`](file:///home/pat/Dokumente/GitHub/cachy-app/src/services/technicalsService.ts#L222-L226)
- [`src/workers/technicals.worker.ts`](file:///home/pat/Dokumente/GitHub/cachy-app/src/workers/technicals.worker.ts)
