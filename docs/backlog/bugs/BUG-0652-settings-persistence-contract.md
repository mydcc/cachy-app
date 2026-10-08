---
id: BUG-0652
title: A settings field that toJSON() forgets is never saved, and nothing says so
type: bug
status: in-progress
assignee: opencode
branch: fix/settings-persistence-contract
priority: P1
milestone: none
editions: [community, pro, private]
area: persistence
data_class: A
adr: none
depends_on: []
---

# BUG-0652 — A settings field that toJSON() forgets is never saved, and nothing says so

## Symptom

A setting that reaches the class but not `toJSON()` cannot be persisted. The
autosave `$effect` depends on `toJSON()` — and on nothing else — so such a field
is not a dependency of the effect, changing it schedules no save, and the user's
choice is gone on the next reload. There is no error, no log entry, and no
failing test. The UI shows the value as set until the page is reloaded.

## Evidence

**Derived**, and two instances **demonstrated**.

- *Derived* — two pieces of code that disagree. `src/stores/settings.svelte.ts:1072-1074`
  registers the effect and states the invariant in a comment
  (`// Track ALL properties by calling toJSON()`, then `this.toJSON();`).
  The account CRUD methods call `save()` explicitly (`this.save();` at
  `src/stores/settings.svelte.ts:643`, `:658`, `:682`, `:734`), so they are
  safe. Every other write — every plain `bind:` to a settings field — has no
  explicit save and relies entirely on `toJSON()` reading the field. A field it
  does not read is invisible to the effect. The invariant was stated in a
  comment, which is not a check, and no test asserted it.
- *Demonstrated — `rssFilterBySymbol`.* Declared in `defaultSettings`, present
  as a `$state` field, and read by `src/services/newsService.ts` (the
  `if (s.rssFilterBySymbol && symbol)` branch). It was in neither `toJSON()` nor
  the `load()` merge, so it could not round-trip.
- *Demonstrated — `pnlViewMode`.* The same shape, found by review rather than by
  the check: a `$state` field with **no entry in `defaultSettings`**, written by
  two components (`src/components/settings/tabs/IndicatorSettings.svelte:183`
  and `src/components/shared/PositionsList.svelte:107`), whose merge was the
  bare `this.pnlViewMode = merged.pnlViewMode;` with nothing to fall back on —
  so a stored blob predating the setting left it `undefined`.
  `src/components/shared/PositionsList.svelte:133` already treated `"value"` as
  the effective default, which is what settled the value.

No user has reported either, and the reason differs in each case. For
`rssFilterBySymbol` no component binds to it either, so the value was always the
default and the filter branch never fired. For `pnlViewMode` the single read site
masks it with `|| "value"`. Both are latent, not absent.

## Cause

Five places must agree on the field set — `defaultSettings`, the `$state`
fields, `toJSON()`, `applyCoreFields` and `applyDisplayFields` — and nothing
compared them. `defaultSettings` was module-private, so the comparison was not
even writable from a test. The declaration drifted from the serializer and from
the merge, and the gap was invisible because the only mechanism linking a field
to persistence is a comment.

## Fix

- Export the declared key set so the comparison is possible at all, and check it
  in both directions.
- Split the tolerated keys by kind. Keys that are not settings at all (a storage
  marker, encryption bookkeeping) are exceptions. Keys that are declared and
  persisted but have **no default** are defects to fix, and are held to a
  stronger rule: each must be unwritten from the UI, since a setting nothing can
  set cannot lose a value.
- Make the exception lists shrinkable — an exception for a key `toJSON()` no
  longer emits is a failure, not a comment that outlives its subject.
- Close both instances: `rssFilterBySymbol` gains its merge step, `pnlViewMode`
  gains a `"value"` default and a `??` merge.
- Cover the load side for the fields this item touches, with real round-trip
  tests.

Leave the persistence architecture alone. This fixes the gaps and the check; it
does not split the class, change the storage key, or alter how anything is
encrypted.

## Why P1

Not because a user has lost a setting — nobody has. Because the *next* setting
added to this class will hit the same trap, and the class has 166 fields, ~1243
direct reads from 106 production files, and a `$effect` whose only dependency
tracking is a name-level agreement between two hand-maintained lists. The
`area: persistence` grouping is deliberate: BUG-0621 ("restoreFromBackup merges
missing fields instead of overwriting", P1, `data_class: A`) is the structural
sibling, and this item is the same failure class on the other side of the
round-trip.

## Acceptance criteria

- [x] A test reproduces the defect and fails without the fix
- [x] The test passes with the fix
- [x] Both directions are checked — a declared setting missing from `toJSON()`,
      and an orphan key in `toJSON()`
- [x] The exception lists are split by kind, and `MISSING_DEFAULT` entries must
      be unwritten from the UI
- [x] Exceptions that `toJSON()` no longer emits fail, so the lists can shrink
- [x] The guard is mutation-verified in every direction it claims, and the
      failure message names the offending field
- [x] `rssFilterBySymbol` and `pnlViewMode` round-trip — both serialized and
      loaded, with real load tests
- [x] The guard's docstring states what it does not check
- [x] Existing settings tests still pass

## Not fixed here

- **`rssFilterBySymbol` is still unwired at the UI end.** Four locale keys exist
  and are fully populated in **both** `src/locales/locales/de.json` and
  `en.json` (`settings.rssFilterBySymbol`, `…Desc`, and the
  `settings.integrations.*` pair), with no component binding the field. That is
  the fingerprint of a binding that was removed or never landed, and it is a
  product question, not a persistence one.
- **The load merge and the reactivity blind spots** are unguarded classes rather
  than single defects, and are recorded as BUG-0653.

## Links

- `src/stores/settings.svelte.ts` — the effect, `toJSON()`, `defaultSettings`
- `src/stores/settings.persistenceContract.test.ts` — the guard
- `src/stores/settings.load.test.ts` — the round-trip coverage
- `src/services/newsService.ts` — the consumer that revealed `rssFilterBySymbol`
- BUG-0653 — the remaining blind spots
- FEAT-0342 — the decomposition this is a precondition for
