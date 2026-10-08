---
id: FEAT-0342
title: "Decompose remaining god modules (VisualsTab, tradeService)"
type: feature
status: in-progress
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
assignee: opencode
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

## Status note (2026-10-08, slice F in progress, branch `feature/feat-0342-slice-f-resets`)

`src/stores/settings/resets.ts` (new) holds `resetGalaxy` / `resetTradeFlow`
/ `resetChart` as pure functions over a caller-supplied target — no I/O, no
store reads, no runes — following the `accounts.ts` precedent. The three
`SettingsManager` methods keep their names and signatures and delegate with
`this`, so the reactive assignments stay on the manager and the autosave
`$effect` keeps tracking every field through `toJSON()` (same reason slice E
is risky and F is not). No `save()` was added: the methods never called it,
the effect persists the assignments.

Two behaviours are pinned by the new `resets.test.ts` because a careless
extraction would flip them: `backgroundBlur` resets to literal 0 while
`defaultSettings` ships 5, and galaxy is a shallow spread while trade-flow is
a `structuredClone`. Verified: new `resets.test.ts` (4 tests, RED-proven on
the blur pin), all 14 `src/stores/settings` suites (202 tests),
`settings.security.test.ts` (15, incl. the resetChart round-trip) and
`ChartTab.component.test.ts` (3) pass unedited.

**Still open.** Slice E (field mapping behind a schema, `toJSON()` +
`applyCoreFields()` + `applyDisplayFields()` = 474 lines) — own PR, human
review, round-trip guard first.

## Status note (2026-10-08, slice D merged in PR #3955)

`tradeService.ts`: 2492 → **2232** lines. `src/services/trade/accountSettings.ts`
(516 lines) now holds `fetchLeverageMarginMode`, `fetchPositionMode`,
`changeLeverage`, `changeMarginMode`, `changePositionMode`,
`adjustPositionMargin` and the private `accountSettingRequest`,
`readBackUntilApplied` and `warnUnconfirmed`. The public signatures are
unchanged, so the 28 tests in `tradeService_accountSettings.test.ts` pass
without being edited. `READ_BACK_ATTEMPTS` / `READ_BACK_DELAYS_MS` moved with
the lane — nothing else used them.

**This lane is deliberately not gated, and that must survive future moves.**
It reaches the venue through `exchangeSignedFetch` rather than
`signedRequest`, because account settings are not orders and therefore carry
no FEAT-0011 gate pass. Routing them through `signedRequest` would need a
pass they cannot produce, or a hole in `assertGatePass`. For the same reason
`accountSettingRequest` refuses outright in paper mode (FEAT-0068):
`paperExchange` simulates orders and has no notion of leverage or margin
mode, so there is nothing on the far side to change.

`warnUnconfirmed` is a port rather than a toast call. A first cut translated
the message inside the module, which put svelte-i18n on the failure path of
every read-back that gives up — under this test file's mocks the store's
value is not callable at that point, and nine tests failed. Handing the owner
a callback is also what `tpSlService` does with its message keys.

The paper-mode seam guard followed the code: the FEAT-0068 refusal now sits
in the module and reads the mode through its port, so it is named there and
its `throw` is matched too, while the domain-wide backstop still counts all
three branches under either spelling. Three mutations turn it red.

**Still open.** Slices E and F, both on `settings.svelte.ts` (2166 lines,
untouched so far):

- **E — field mapping behind a schema.** `toJSON()` (187) +
  `applyCoreFields()` (142) + `applyDisplayFields()` (145) = 474 lines. The
  riskiest step in this item, because it touches credential serialisation
  (BUG-0280 redaction, BUG-0519 encryption-failure aggregation). Needs its
  own PR with human review, and a round-trip guard that forces every key of
  `defaultSettings` in both directions — a key missing from either direction
  is silent data loss on the next save.
- **F — thin out the delegation.** `accountFor` / `addAccount` /
  `renameAccount` / `removeAccount` already delegate to
  `src/stores/settings/accounts.ts`; the three `reset*` methods become pure
  functions over a target in `src/stores/settings/resets.ts`.

The `$effect` in the constructor treats `toJSON()` as the dependency tracker,
so fields that move into another store stop being observed and autosave dies
for them without an error. Slice E has to deal with that, not route around it.

## Status note (2026-10-08, slices A–C merged in PR #3948)

`tradeService.ts` had grown to 3102 lines since this item was specced (the
~1700 in the Problem statement is stale). The earlier note's claim that the
`TradeService` and `SettingsManager` classes "share private mutable state
across domains" is **wrong**, and it made this look far riskier than it is:
`TradeService` has exactly three private fields, each local to one domain —
`fetchPositionsPromise` (dead, deleted), `metaFetchInflight` (pair metadata,
moved out with it) and `mirroredOmsKeys` (OMS mirroring, still in place). The
real coupling runs through module singletons, not fields.

**Merged in slices A–C** (PR #3948, behaviour preserving, 3102 → 2485 lines):

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

**Lesson that constrains the next slice.** Moving code into a new module made
two source-scan guards quietly blind, and neither failed loudly:

- `paperTrading_seam.test.ts` counted `if (paperState.enabled)` in
  `tradeService.ts` only. Once the TP/SL read moved out, a *second*
  live/paper branch placed in the new module passed every test. The scan now
  reads the whole trade domain and pins the domain-wide total.
- The FEAT-0327 credential relaxation had only its paper half under test, so
  "live mode with no credentials must refuse" was pinned by a regex that also
  matched a stubbed-out keys source. It is a behaviour now.

Both were confirmed by mutation before the fix, not after. **Any further
extraction into `src/services/trade/` must re-check the file scope of every
architecture scan** — see `src/tests/architecture/`. That audit is the next
piece of work, deliberately ahead of slice D, because slice D moves a gated
write (`accountSettingRequest`) into a new module.

**Guard-scope audit (2026-10-08), measured by injection.** `order_gate_bypass`
is structurally sound for the slice-D move — its domain-wide scan walks all of
`src/` and skips only `tradeService.ts`, so a mutating order placed in a new
`src/services/trade/` module is caught. Three pre-existing limits are worth
knowing before slice D, none of them caused by slice C:

1. `TRANSPORT_OWNER` is a single hardcoded path. The exemption it buys is
   compensated by a second assertion over the same path, so the pairing holds
   — but only for as long as the transport and its check stay in one file.
2. The scan matches the literal `signedRequest(` per line. Reaching the
   transport through a local alias (`const send = ports.signedRequest`) is not
   detected. Deliberate obfuscation, not an accident — but it does mean the
   scanner cannot be defeated by "a branch that never runs in tests", which is
   what its own comment claims.
3. Nothing scans `exchangeSignedFetch` or `appFetch` for a mutating action.
   Five production files call the signing primitive directly, so a module
   could sign and dispatch a mutating order without any architecture test
   noticing.

Slice D does not have to fix 2 and 3, but it must not assume they exist.

**Not merged, and why:**

- **Slice D** (account-settings, ~385 lines) is a clean extraction but touches
  leverage/margin-mode/position-mode writes. Separate PR, human review.
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
