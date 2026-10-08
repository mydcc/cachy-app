---
id: FEAT-0342
title: "Decompose remaining god modules (VisualsTab, tradeService)"
type: feature
status: in-progress
assignee: opencode
branch: refactor/feat-0342-trade-service-slice-abc
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
parent: FEAT-0341
---

## Problem
Despite previous decomposition efforts (FEAT-0190), several files remain excessively large ("God Modules"):
- `src/components/settings/tabs/VisualsTab.svelte` (~1930 lines)
- `src/stores/settings.svelte.ts` (~2130 lines)
- `src/services/tradeService.ts` (~1700 lines)
- `src/services/apiService.ts` (~1200 lines)

These monolithic files violate clean architecture principles, making maintenance and concurrent development difficult.

## Fix
Decompose these files into smaller, focused modules or sub-components.
For `VisualsTab.svelte`, extract repeated markup into smaller components like `<ColorPickerSection>` and `<VisualGroup>`, or drive the UI via a data configuration schema.
For the services, split responsibilities by domain (e.g., splitting `apiService` into exchange, user, and ai).

## Acceptance criteria
- [ ] `VisualsTab.svelte` is decomposed and falls below 500 lines of code.
- [ ] `tradeService.ts` is split into domain-specific services.
- [ ] `settings.svelte.ts` is refactored into smaller isolated state stores.
- [ ] `apiService.ts` is divided.
- [ ] All existing unit tests pass, and new tests are written for the extracted modules.
## Out of scope

- Changing the functionality of the settings or trading logic.
- Splitting every file in the project (only the ones explicitly listed).

## Status note (2026-10-07, slices A–C in flight on `refactor/feat-0342-trade-service-slice-abc`)

`tradeService.ts` has grown to 3102 lines since this item was specced (the
~1700 in the Problem statement is stale). The earlier note's claim that the
`TradeService` and `SettingsManager` classes "share private mutable state
across domains" is **wrong**, and it made this look far riskier than it is:
`TradeService` has exactly three private fields, each local to one domain —
`fetchPositionsPromise` (dead, deleted in this slice), `metaFetchInflight`
(pair metadata, moved out with it) and `mirroredOmsKeys` (OMS mirroring,
still in place). The real coupling runs through module singletons, not fields.

**This slice (A–C, one PR):** three low-risk extractions, all behaviour
preserving, 3102 → ~2485 lines:

- `src/services/trade/dispatchSession.ts` — the BUG-0551 dispatch-context
  rule. Reads are injected because `services` may not import `stores`
  (see `eslint.architecture.boundaries.js`); `readDispatchContext` stays in
  `tradeService.ts` and is passed in.
- `src/services/trade/payloadCodec.ts` — payload validation, Decimal
  serialization, intent completion. `completeIntent` takes the account half as
  an argument for the same reason.
- `src/services/trade/pairMeta.ts` — pair metadata loader, carrying its own
  in-flight bookkeeping, with the three `marketState` writes behind a port.
- `src/services/trade/tpSlService.ts` — TP/SL reads and writes. Every write
  still reaches the gate through the same `gatedRequest`; there is no second
  route to a state-mutating request.

**Not in this slice, and why:**

- **Slice D** (account-settings, ~385 lines) is a clean extraction but touches
  leverage/margin-mode/position-mode writes. Separate PR.
- **Slice E/F (`settings.svelte.ts`, 2166 lines)** — decided, do not improvise:
  the settings split must be **robust, safe and scalable**, which rules out
  the cheap trick of moving field mapping into plain modules. The target is a
  **persistence coordinator plus genuinely isolated stores**, keeping one
  localStorage profile. Two invariants make this non-obvious and must survive
  the split:
  1. The autosave `$effect` calls `toJSON()` as its dependency tracker. Move a
     field to another store and the effect stops tracking it, so autosave
     dies silently for that field. This is the trap.
  2. `CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY` (`"cryptoCalculatorSettings"`) is
     one key for the whole profile, is watched by the cross-tab listener, and
     is referenced by `autoBackupService.svelte.ts`,
     `settings/secretsLoader.ts` and the public whitepaper. Splitting the
     stores must not split that key, or a migration becomes mandatory and
     user-visible.

  Guard required before any settings field moves: a roundtrip test that forces
  every key of `defaultSettings` in both directions (a key that is written on
  load but dropped on save is silent data loss). Settings is Class A data and
  credential serialization is involved — its own PR, human review.

## Status note (2026-09-24, slice 1 merged; follow-up remains specced)

`VisualsTab.svelte` is already 77 lines (decomposed before this item started).
Slice 1 extracts the safe mechanical seams, all suites green:

- `src/services/apiService.ts` (1247 → ~60 lines): fully divided into
  `src/services/api/` (`marketData`, `requestManager`, `rateLimiter`,
  `marketTypes`, `apiErrors`) plus new `telemetry.ts` injection ports — the
  move also fixed the services-must-not-import-stores violation instead of
  extending the grandfather list. Public surface unchanged (compat module).
- `src/services/tradeService.ts`: errors + order param contracts extracted
  to `src/services/trade/` (`tradeErrors`, `tradeParams`), re-exported.
- `src/stores/settings.svelte.ts`: domain types + presets extracted to
  `src/stores/settings/settingsTypes.ts`, re-exported.

Remainder (NOT in this PR — needs its own slice): splitting the stateful
`TradeService` class and the `SettingsManager` rune graph into domain
services/stores. Both share private mutable state across domains; that
surgery is high-risk exchange/settings code and does not fit a drive-by
refactor. Proposed follow-up: one item per class split, each with Human
review before merge. The stale `in-progress` claim was released on 2026-09-24
because no active session or worktree remains.
