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
area: ui
data_class: A
adr: none
depends_on: []
# assignee:            # required while status: in-progress (who is working this)
---

# BUG-0652 — A settings field that toJSON() forgets is never saved, and nothing says so

## Symptom

A setting that reaches the class but not `toJSON()` cannot be persisted. The
autosave `$effect` depends on `toJSON()` — and on nothing else — so such a field
is not a dependency of the effect, changing it schedules no save, and the user's
choice is gone on the next reload. There is no error, no log entry, and no
failing test. The UI shows the value as set until the page is reloaded.

## Evidence

**Derived**, and one instance **demonstrated**.

- *Derived* — the mechanism is two pieces of code that disagree.
  `src/stores/settings.svelte.ts` registers the effect and states the invariant
  in a comment: `// Track ALL properties by calling toJSON()` followed by
  `this.toJSON()`. The account CRUD methods call `save()` explicitly
  (`this.save()` at the `addAccount`, `renameAccount`, `removeAccount` and
  `setActiveAccount` sites), so they are safe. Every other write — every plain
  `bind:` to a settings field — has no explicit save and relies entirely on
  `toJSON()` reading the field. A field it does not read is invisible to the
  effect. The invariant is stated in a comment, which is not a check, and no
  test asserted it (`grep` for a `toJSON`/`defaultSettings` key comparison in
  `src/**/*.test.ts` returned nothing).
- *Demonstrated* — `rssFilterBySymbol` is one such field, found by writing the
  check that was missing. It was declared in `defaultSettings`, existed as a
  `$state` field, and is read by `src/services/newsService.ts` (the
  `if (s.rssFilterBySymbol && symbol)` branch). It was absent from both
  `toJSON()` and the `load()` merge, so it could never round-trip. No user
  impact yet, because no component binds to it either — the setting is declared,
  translated (`settings.rssFilterBySymbol`, `settings.rssFilterBySymbolDesc`),
  typed (`Settings.rssFilterBySymbol` in `settingsTypes.ts`) and consumed, but
  unwired at both ends. The reported value is therefore always the default
  `false`, which is why nothing has visibly broken.

## Cause

Three places must agree on the field set — `defaultSettings`, the `$state`
fields, and `toJSON()` — and nothing compared them. `defaultSettings` was
module-private, so the comparison was not even writable from a test. The
declaration drifted from the serializer, and the gap was invisible because the
only mechanism linking a field to persistence is a comment.

## Fix

- Export the declared key set so the comparison is possible at all, and check
  it in both directions: every declared setting must be serialized, and
  `toJSON()` must emit nothing that is neither declared nor a named exception.
- Each exception carries a written reason, and an exception that is also a
  declared key is an error — that would mean the real answer is a missing
  default.
- Close `rssFilterBySymbol`: serialize it and load it, using `??` so an
  explicitly stored `false` survives instead of falling through to the default.

Leave the persistence architecture alone. This fixes the gap and the check; it
does not split the class, change the storage key, or alter how anything is
encrypted.

## Acceptance criteria

- [x] A test reproduces the defect and fails without the fix
- [x] The test passes with the fix
- [x] Both directions are checked — a declared setting missing from `toJSON()`,
      and an orphan key in `toJSON()`
- [x] The guard is mutation-verified in both directions, and the failure
      message names the offending field
- [x] `rssFilterBySymbol` round-trips: it is serialized and loaded
- [x] Existing settings tests still pass

## Links

- `src/stores/settings.svelte.ts` — the effect, `toJSON()`, `defaultSettings`
- `src/stores/settings.persistenceContract.test.ts` — the guard
- `src/services/newsService.ts` — the consumer that revealed the gap
- FEAT-0342 — the decomposition this is a precondition for
