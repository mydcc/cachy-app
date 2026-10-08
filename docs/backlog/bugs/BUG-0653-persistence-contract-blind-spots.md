---
id: BUG-0653
title: The settings persistence contract is checked by name, and only on the save side
type: bug
status: specced
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

## Cause

`toJSON()`, `defaultSettings`, the `$state` fields, `applyCoreFields` and
`applyDisplayFields` are five places that must agree, and the contract that
connects them is behavioural — it is about which reactive reads the autosave
`$effect` makes. A key-set comparison is the cheap part of that and was worth
building first; on its own it reads as more than it enforces, and BUG-0652's own
review found the overclaim in its docstring.

## Fix

- Extend the contract to the load side: assert that every key `toJSON()` emits
  is either assigned by `applyCoreFields`/`applyDisplayFields` or is a named
  exception. This is a source-level check, so it needs the same mutation
  discipline as `order_gate_bypass.test.ts`.
- Add one runtime reactivity assertion: build a manager inside `$effect.root`,
  flip a field, and assert a save was scheduled. That is what closes the
  wrong-field and non-reactive-backing-field blind spots, and it is the only
  check that speaks the language the bug is actually written in.

## Acceptance criteria

- [ ] A test fails when a serialized key is never assigned by the load merge
- [ ] A test fails when a `toJSON()` entry reads a different field than its key
- [ ] A test fails when a serialized key's backing store is not reactive
- [ ] Each of the three is mutation-verified against the unmutated tree, and the
      control is green
- [ ] The guard's own docstring states exactly what it does and does not check

## Out of scope

Splitting the class, changing the storage key, or changing what is encrypted.
Those are the decomposition work in FEAT-0342; this is the guard it would need.

## Links

- `src/stores/settings.svelte.ts` — `toJSON()`, `applyCoreFields`, the `$effect`
- `src/stores/settings.persistenceContract.test.ts` — the guard, and the
  blind spots its docstring names
- BUG-0652 — made the save side checkable
- FEAT-0342 — the decomposition this is a precondition for
