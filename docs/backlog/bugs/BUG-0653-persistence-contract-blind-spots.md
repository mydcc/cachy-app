---
id: BUG-0653
title: The settings persistence contract is checked by name, and only on the save side
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: persistence
data_class: A
adr: none
depends_on: []
# assignee:            # required while status: in-progress (who is working this)
---

# BUG-0653 — The settings persistence contract is checked by name, and only on the save side

## Symptom

BUG-0652 made the autosave contract checkable: a setting declared in
`defaultSettings` but absent from `toJSON()` now fails a test, because the
constructor's `$effect` would never track it and the user's change would be lost
on reload.

Two gaps remain, both confirmed by mutation against the guard as merged:

- **The load side has no guard at all.** `applyCoreFields` and
  `applyDisplayFields` are a hand-maintained, parallel copy of the key set. A
  setting can serialize and never load, which is silent data loss of the same
  kind, in the opposite direction.
- **The check compares names, not reads.** It cannot see which field a
  `toJSON()` entry reads, nor whether a field's backing store is reactive. Both
  were verified green by mutation.

## Evidence

**Demonstrated**, by mutation against the merged guard — all reverted, tree
verified clean.

- *Load side unguarded* — deleting both lines of the `rssFilterBySymbol` merge
  step left the contract test **and** `settings.load.test.ts` fully green after
  BUG-0652: **32 of 32**, measured on the pre-fix tree, which carried 4 guard
  tests and 28 load tests. On `develop` today the same two files are 5 + 33 = 38,
  and the mutation now goes red. The field would have been written on every save
  and never read back. BUG-0652 closed this for that one field with five
  round-trip tests; the class is still unguarded, and the other ~170 keys were
  not audited.
- *Name check is blind to the wrong field* — changing `showSidebars: this.showSidebars`
  to `showSidebars: this.showTooltips` left the guard green: **4 of 4** on the
  pre-fix tree, and still **5 of 5** on `develop`, re-measured. `showSidebars`
  becomes invisible to the autosave effect — the identical defect to the one
  BUG-0652 fixes — and `showTooltips` is tracked twice.
- *Name check is blind to a non-reactive backing field* — a field declared in
  `defaultSettings` and emitted by `toJSON()` through an accessor pair, whose
  backing field is a plain field rather than `$state`, would also leave the
  guard green. The effect cannot track such a field. **This one is
  hypothetical: no instance exists in the class today.** The two accessor
  pairs that do exist, `_apiProvider` (`settings.svelte.ts:411`) and
  `_marketMode` (`:884`), are both `$state`, so the effect tracks them. The
  first draft of this item cited `_apiProvider` as an instance; it is not one,
  and the citation was removed rather than softened.

### Added by the runtime assertion

`src/stores/settings.reactivityContract.component.test.ts` writes every
serialized key and asserts a save was scheduled. Three things it established,
all measured:

- *Two serialized keys do not live on the manager.* `isPro` and
  `isProLicenseActive` are declared in `defaultSettings` and read by `toJSON()`
  (`settings.svelte.ts:1978`, `:2093`), but the fields themselves are on
  `this.entitlement` — an `EntitlementStore` where both are `$state`
  (`src/stores/entitlement.svelte.ts:34-35`), and the load merge assigns through
  the same accessor (`settings.svelte.ts:1586`, `:1757`). The reactivity is
  correct; what is wrong is the assumption that a serialized key names a field
  on the manager. Writing `settings.isPro` creates an inert own property. The
  test routes those two keys to their owner and asserts that *every* key the
  manager does not carry is declared, so a third one fails loudly instead of
  being reported as a reactivity defect.
- *A runtime reactivity assertion only works in the `components` Vitest
  project.* Written as a plain `.test.ts` it passes 167 keys as broken. Only
  `vite.config.ts:209` sets `resolve.conditions: ["browser"]` for `components`;
  in `unit`, `svelte` resolves to the server entry where `$effect` is inert, so
  the autosave effect never runs. Measured: `toJSON` call count after writing
  `showSidebars` was 0 in `unit` and 1 in `components`.
- *The counts.* 173 `$state` fields, 167 serialized keys, 6 fields not
  referenced by `toJSON()` (`_apiProvider`, `_marketMode`, `isLocked`,
  `decryptionFailures`, `encryptionFailures`, `deviceKeyLost`). The arithmetic
  closes from three directions: the field count from parsing the declarations,
  `SETTINGS_KEYS.length` from the running test, and the difference as the six
  names above. BUG-0652 said 166 and 174.

### Mutation evidence for the new assertion

Each mutation turned exactly one key red and the control green.

| Mutation | Reported inert |
|---|---|
| `showSidebars: this.showSidebars` → `this.showTooltips` | `showSidebars` only |
| `chartFixEdges = $state<boolean>(…)` → plain `boolean` field | `chartFixEdges` only |
| none (control) | 3 of 3 green |

A first version of the test reported **all 167 keys** as broken while the store
was fine. The cause was in the test: restoring a key left its autosave timer
pending, so the next iteration's `advanceTimersByTime` fired *that* timer and
credited the key with a save its own write never caused. The first mutation was
therefore green. Draining the timer after each restore is what made both
mutations red — recorded here because the failure mode is invisible: a guard
that cannot fail is indistinguishable from a store with no autosave at all.

## Cause

`toJSON()`, `defaultSettings`, the `$state` fields, `applyCoreFields` and
`applyDisplayFields` are five places that must agree, and the contract that
connects them is behavioural — it is about which reactive reads the autosave
`$effect` makes. A key-set comparison is the cheap part of that and was worth
building first; on its own it reads as more than it enforces, and BUG-0652's own
review found the overclaim in its docstring.

## What the load-side guard found

Three settings were serialized, written by the UI, and never assigned on load:
`marketAnalysisInterval`, `pauseAnalysisOnBlur` and `analysisTimeframes`. A user
changed one, the autosave wrote it, and the next reload put the default back.

Measured with sentinels that cannot coincide with any default — an earlier probe
stored values that happened to match, which proved nothing:

| Key | stored | after construction | default |
|---|---|---|---|
| `marketAnalysisInterval` | `12345` | `60` | 60 |
| `pauseAnalysisOnBlur` | `"SENTINEL"` | `true` | true |
| `analysisTimeframes` | `["SENTINEL"]` | `["1h","4h"]` | `["1h","4h"]` |
| `technicalsCacheTTL` *(control)* | `4242` | `4242` | 60 |
| `showTooltips` *(control)* | `"SENTINEL2"` | `"SENTINEL2"` | true |

`marketAnalysisInterval` is the confusing one. It *is* assigned — inside
`applyMarketMode`, which only the `marketMode` setter calls. `load()` assigns
`_marketMode` directly and so never fires that setter, so that path cannot run
during a load either. It was never restored under any circumstances.

All three are written by `CalculationSettings.svelte:81,82,86,271,277`, so this
was reachable from the settings UI, not a theoretical gap.

Fixed by assigning them in `applyCoreFields`, with three round-trip tests in
`settings.load.test.ts`. Removing the assignments turns those three tests red;
removing one of them turns the source guard red naming that key.

## Fix

- **Done** — one runtime reactivity assertion:
  `src/stores/settings.reactivityContract.component.test.ts`. Builds a manager,
  flips every serialized key, and asserts the autosave `$effect` scheduled a
  save. That closes the wrong-field and non-reactive-backing-field blind spots,
  and it is the only check that speaks the language the bug is written in. It
  must be a `.component.test.ts`; see the measured reason above.
- **Done** — the load side:
  `src/stores/settings.loadContract.test.ts`. Asserts that every key `toJSON()`
  emits is assigned somewhere in the load path — `load()`, `applyCoreFields` or
  `applyDisplayFields` — with the indirections the class actually uses *derived*
  from its shape rather than listed: `_apiProvider`/`apiProvider` and
  `_marketMode`/`marketMode` behind their accessors, `isPro` and
  `isProLicenseActive` on the `entitlement` store. The exemption list is empty
  and asserted empty, so it cannot become a hiding place. It found three real
  instances on first run; see below.

## Acceptance criteria

- [x] A test fails when a serialized key is never assigned by the load merge
- [x] A test fails when a `toJSON()` entry reads a different field than its key
- [x] A test fails when a serialized key's backing store is not reactive
- [x] All three are mutation-verified against the unmutated tree, and the
      controls are green
- [x] The guard's own docstring states exactly what it does and does not check,
      including that it only runs in the browser-condition Vitest project

## Out of scope

Splitting the class, changing the storage key, or changing what is encrypted.
Those are the decomposition work in FEAT-0342; this is the guard it would need.

## Links

- `src/stores/settings.svelte.ts` — `toJSON()`, `applyCoreFields`, the `$effect`
- `src/stores/settings.persistenceContract.test.ts` — the save-side guard
- `src/stores/settings.loadContract.test.ts` — the load-side guard
- `src/stores/settings.reactivityContract.component.test.ts` — the runtime half
  that closes the name-vs-read blind spots
- `src/stores/entitlement.svelte.ts:34-35` — where `isPro` and
  `isProLicenseActive` actually live
- `settings.svelte.ts:956` (`applyMarketMode`), the only caller of which is the
  `marketMode` setter — why the interval was never restored on load
- BUG-0652 — made the save side checkable
- FEAT-0342 — the decomposition this is a precondition for
