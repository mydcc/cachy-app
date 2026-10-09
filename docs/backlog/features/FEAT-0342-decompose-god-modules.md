---
id: FEAT-0342
title: "Decompose remaining god modules (VisualsTab, tradeService)"
type: feature
status: ready
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
parent: FEAT-0341
---

## Status note (2026-10-09, ADR-0024 decision 1 implemented — branch `feature/0342-explicit-autosave-tracking`)

The `in-progress` claim (`assignee: opencode`) is released: the tracking work
is implemented and waiting on review, and no session holds the item. Status is
back to `ready`.

What this step delivered (decision 1 of ADR-0024, no field moved): the autosave
`$effect` iterates a declared tracking list (`src/stores/settings/tracking.ts`,
generated from `PERSISTENCE_SCHEMA`) instead of calling `toJSON()`. The reads
are identical by construction — `readSerializedField` serves both paths, so a
memoised or restructured `toJSON()` can no longer silently un-save the store.
`update()` is deleted (zero production callers; `marketStore_limits.test.ts`
writes the field directly). Proven: the reactivity contract gains a
memoised-`toJSON` test that goes red on the old effect, and `tracking.test.ts`
fails on a missing group. AC 3 itself is still open — field moves behind the
facade are step 2, gated on this step landing.

## Problem
Despite previous decomposition efforts (FEAT-0190), several files remain excessively large ("God Modules"):
- `src/components/settings/tabs/VisualsTab.svelte` (1934 lines at speccing)
- `src/stores/settings.svelte.ts` (2184 lines at speccing)
- `src/services/tradeService.ts` (3102 lines at speccing)
- `src/services/apiService.ts` (1247 lines at speccing)

These monolithic files violate clean architecture principles, making maintenance and concurrent development difficult.

(Measured at speccing commit `fe96e160b`. An earlier revision of this
section carried estimates that undercounted — `tradeService` ~1700 — because
the files kept growing after the spec was written.)

## Fix
Decompose these files into smaller, focused modules or sub-components.
For `VisualsTab.svelte`, extract repeated markup into smaller components like `<ColorPickerSection>` and `<VisualGroup>`, or drive the UI via a data configuration schema. **(Satisfied ahead of this item by PR #2720.)**
For the services, split responsibilities by domain. `apiService` was cut along
its transport seams — `marketData`, `requestManager`, `rateLimiter`,
`marketTypes`, `apiErrors`, plus new `telemetry` injection ports — rather than
along the exchange/user/ai split originally sketched here; the seams matched
the real coupling, so the Fix text was rewritten to describe what shipped.

## Acceptance criteria
- [x] `VisualsTab.svelte` is decomposed and falls below 500 lines of code. **Met, but
      not by this item** — it was 1934 lines when this item was specced (`fe96e160b`);
      the split to 77 landed in `1dc976ff3` (PR #2720) four days later, in work that
      never touched this file. No FEAT-0342 PR has edited `VisualsTab.svelte`.
- [ ] `tradeService.ts` is split into domain-specific services. **Partial**: 3102 → 2232
      lines, seven lanes extracted and thin-delegated back through a retained façade, but
      still one class carrying ≥9 domains (`signedRequest` 242, `flashClosePosition` 260,
      `modifyOrder` 225 raw lines).
- [ ] `settings.svelte.ts` is refactored into smaller isolated state stores. **Not
      started.** What shipped is the *other* half of the target below — the persistence
      coordinator. `SettingsManager` is still a single `$state` holder; see the
      blocker recorded in the AC-3 note.
- [x] `apiService.ts` is divided. 1247 → 69 lines across `src/services/api/`.
- [ ] All existing unit tests pass, and new tests are written for the extracted modules.
      **Partial**: suites green (583 unit + 3 reactivity-contract), but four extracted
      modules ship without a colocated test — `trade/tradeParams`, `api/apiErrors`,
      `api/rateLimiter`, `api/requestManager`.

### What blocks AC 3

The autosave `$effect` in the constructor (`settings.svelte.ts`) registers **one**
tracking point: it calls `toJSON()`, which iterates `PERSISTENCE_SCHEMA` and reads
`self[field.key]` — a dynamic index read on `this`. That single read builds the
dependency graph for all 172 fields, and it only works because every field is a
`$state` class field on `this`. Four things break the moment one moves elsewhere:

1. `settingsState.<field>` is read directly in 97 production files (183
   distinct fields, 1255 accesses — measured on `ef199e7ae`; an earlier
   revision of this note said "107 files (~600 accesses)", which matches no
   reproducible count on that base),
   so a split either rewrites every consumer or reintroduces the coupling through an
   accessor façade.
2. `update()` does `Object.assign(this, fn(this.toJSON()))`, but it has **no
   production caller** — the only four call sites in the repo are in
   `marketStore_limits.test.ts` (an earlier revision of this note said "46
   call sites", which is wrong; verified by grep). A nested field is simply
   not reached, but nothing in production depends on the flat shape, so this
   brake costs a deletion rather than a migration.
3. The cross-tab `storage` listener clears `effectActive` for *this* effect only —
   sibling stores with their own effects would keep writing.
4. The recovery path in `load()` writes defaults over the whole blob, which across
   several stores could persist a mixed state.

Slices E and F were chosen precisely because they move no fields, so the tracking
point survived intact. That was the right call, and it is why AC 3 is untouched
rather than partly delivered.
## Out of scope

- Changing the functionality of the settings or trading logic.
- Splitting every file in the project (only the ones explicitly listed).

## Status note (2026-10-09, claim released after the closeout merges)

The `in-progress` claim (`assignee: opencode`, branch
`fix/feat-0342-closeout-security`) is released: that branch merged, and the
stale-claim gate rightly refuses a merged branch holding an item. Status is
back to `ready` — waiting on a human, not on more slicing.

What landed since: the credential hardening, guard blind-spot closures,
schema-invariant pins, the position-lifecycle extraction (`tradeService.ts`
2232 → ~1977) and the guard/doc debt (PRs #3981–#3985). What is open is AC 3,
the settings-store split, which was never started for the reason recorded
under "What blocks AC 3". Its draft lives in ADR-0024 (PR #3986): explicit
tracking ownership first, field moves second — or a conscious decision to
leave the class whole. Merging this PR does not close that question.

## Status note (2026-10-08, review closeout — branch `fix/feat-0342-closeout-security`)

A four-way review of the five merged PRs. **No runtime regression was found**:
the schema transcription is 1:1 against the pre-extraction code (172 save keys,
98+66 load assignments), the `services→stores` boundary holds, the decimal audit
is clean, and the gate scanners catch an injected bypass. The defects were in
the verification and documentation layer.

Fixed here:

- **`openrouterApiKey` reached `localStorage` as plaintext** — it was the one
  credential outside `SENSITIVE_KEYS` (`persistenceSchema` writes it
  `save: "direct"`), and `backupService` blanked it by hand, which shows the
  omission was known. Adding it is not a one-liner: the `!canEncrypt` branch of
  `applyFieldEncryption` redacts every sensitive key when the session is locked,
  so a legacy plaintext value held by a master-password user would have been
  destroyed unrecoverably. The rule is now *redact only what is already
  protected* — a key with a ciphertext entry is blanked as before, one without
  survives until the next `canEncrypt` pass and becomes ciphertext there.
- **Schema-level load failures wrote defaults over the whole profile.** An
  unknown `save`/`load` mode reached `load()`'s destructive catch, turning a
  one-line typo into silent total settings loss. The two `apply*` calls now get
  their own catch that logs unconditionally.
- `hasActiveKeys` read `apiProvider` without the `|| "bitunix"` fallback its
  sibling port carries — under a comment claiming both had it.
- `adjustPositionMargin` passed `decimalPlaces()` into `toFixed()`, which rounds
  a value carrying binary residue instead of emitting full precision.
- A comment in `backupService` credited BUG-0654 with removing
  `openrouterApiKey`. BUG-0654 removed `imgurClientId`; this one is live.

Both fixes are RED-proven by removing the change and watching the specific test
fail by name. Verified: `secretsLoader` 35, settings + trade + backup + architecture
583, reactivity contract 3 — all green; decimal audit and ESLint clean.

Still open, tracked on this item: the guard blind spots (the paper/live seam scan
covers 1 of 6 read sites; the gate alias scanner misses destructuring; the
`structuredClone` guard is satisfied by a comment), `accountSettings.test.ts`, and
AC 3, which is unstarted for the reason recorded under the acceptance criteria.

## Status note (2026-10-08, slice E merged in PR #3975)

`src/stores/settings/persistenceSchema.ts` (new, 526 lines) holds the single
key table `PERSISTENCE_SCHEMA` plus the pure custom mergers — the
Schema-Variante: `toJSON()` + `applyCoreFields()` + `applyDisplayFields()`
(~474 lines) are now thin drivers (`settings.svelte.ts` 2184 → 1755 lines at
that merge; **1774** at `ef199e7ae`, after the guard review follow-ups grew it
back).
Reactive assignments, `$state.snapshot` calls, the entitlement reads and
`ensureProviderRegistry()` stay in the manager, so autosave tracking through
`toJSON()` is unchanged; single `cryptoCalculatorSettings` key untouched.

Behaviour preserved exactly: `??` vs `||` per key transcribed 1:1 (one
exception found and kept: `customHotkeys` loads `|| {}`, never the shared
default object), BUG-0280 redaction with live-key deep-read, feeRates
per-venue merge, galaxy/tradeFlow/fireConfig deep merges, price-scale
migration, burn legacy keys, favorites cap. `loadContract.test.ts` moved with
the code (it scanned the old method bodies textually): `load()` residue still
textual, `apply*` coverage now via schema table + driver-wiring assertion.

Verified: new `persistenceSchema.test.ts` (11 tests, exactness RED-proven by
removing a row), settings folder + load/persistence/security/loadContract (215),
reactivityContract (autosave tracking through the new loop) + ChartTab (6),
backup/account (106), credentialStore + storage_hardening (34) — all green,
ESLint clean. Needs human review (Class A, credential serialization).

## Status note (2026-10-08, slice F merged in PR #3971)

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

**Merged in slices A–C** (PR #3948, behaviour preserving, 3102 → 2485 lines;
the slice-D note below opens at 2492 — a +7 inter-PR drift no note accounted
for):

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

## Status note (2026-09-24, slice 1 merged)

**Correction to this note, recorded 2026-10-08.** It previously read that
`VisualsTab.svelte` "is already 77 lines (decomposed before this item
started)". That is wrong. The file was **1934 lines** at this item's speccing
commit (`fe96e160b`, 2026-09-02); the decomposition to 77 lines landed in
`1dc976ff3` — "refactor(settings): split VisualsTab into section components
(#2720)", 2026-09-06, four days *after* speccing and in work that does not
touch this backlog file. No PR under FEAT-0342 has ever edited
`VisualsTab.svelte`. AC 1 is therefore satisfied by prior work, not by this
item, and should not be read as its delivery.

`VisualsTab.svelte` is 77 lines today.
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
services/stores. ~~Both share private mutable state across domains~~ — **this
is wrong**, corrected in the slices A–C note above: `TradeService` has three
private fields, each local to one domain, and the real coupling runs through
module singletons. The surgery is still high-risk exchange/settings code and
does not fit a drive-by refactor. Proposed follow-up: one item per class
split, each with Human review before merge. The stale `in-progress` claim was
released on 2026-09-24 because no active session or worktree remains.
