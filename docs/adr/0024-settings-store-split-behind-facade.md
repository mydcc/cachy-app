# ADR-0024: Split the settings store behind a facade, gated on explicit autosave ownership

- **Status:** Proposed → Decision 1 accepted and implemented (declared tracking list, `update()` deleted — PR "feat(settings): declare autosave tracking ownership explicitly"). Decision 2 in progress: `display` section moved behind the facade first (`DisplaySettingsStore`, 65 fields); `core` section moved second (`CoreSettingsStore`, 97 fields, `marketMode` setter side effect preserved, load bypass routed into the sub-store). Pending: account cluster.
- **Date:** 2026-10-08
- **Deciders:** _undecided — this draft is the input, not the decision_

## Context

FEAT-0342 acceptance criterion 3 asks for `settings.svelte.ts` to become
"smaller isolated state stores". It is **not started**, and the status notes on
that item are explicit that it was never attempted rather than half-finished.

At `ef199e7ae` the file is 1774 lines holding one `SettingsManager` class
(`settings.svelte.ts:412-1753`) with 172 `$state` fields. Slices E and F moved
*functions* out — `persistenceSchema.ts`, `resets.ts`, `accounts.ts` — but
deliberately moved **no fields**, because of this:

```ts
// settings.svelte.ts:1063-1079
this.effectCleanup = $effect.root(() => {
    $effect(() => {
        if (!this.effectActive) return;
        this.toJSON();                       // <- the only tracking read
        untrack(() => { /* debounced save */ });
    });
});
```

`toJSON()` iterates `PERSISTENCE_SCHEMA` and does `self[field.key]`
(`settings.svelte.ts:1702`). That dynamic index read on `this` is what builds the
dependency graph for all 172 fields. **There is exactly one tracking point, and
it works only because every field is a `$state` on `this`.** Move a field
anywhere else and it silently stops being saved — no test fails, no type
errors, the write just vanishes.

### What actually blocks it

| Blocker | Measured | Cost to clear |
|---|---|---|
| `settingsState.<field>` direct reads | **97 production files**, 183 distinct field names | Facade or a rewrite of 97 files |
| `update()`'s flat `Object.assign` shape | **0 production callers.** Only `marketStore_limits.test.ts` (4 calls) | **Free — delete it** |
| Cross-tab `storage` listener mutes tracking | 1 flag, `:1099-1104` | N flags instead of 1 |
| `load()`'s recovery writes the whole blob | `settings.svelte.ts:1552-1557` | Per-store scoping |

The second row contradicts what the FEAT-0342 status notes and earlier review
passes claimed — they recorded "46 call sites" depending on the flat `update()`
form (item note at `docs/backlog/features/FEAT-0342-decompose-god-modules.md`,
AC-3 blocker list, as written by PR #3981). That number is wrong. `update()`
(`:1729-1733`) has **no production caller** — zero outside tests, verified by
grep; the only four call sites in the repo are in
`marketStore_limits.test.ts`. **A reviewer re-deriving these numbers must not
trust the old figure.** One of the four brakes costs nothing to remove
(and the first row's figures are re-measured in the same pass: 97
production files, 183 distinct field names, 1255 accesses — the note's
"107 files (~600 accesses)" matches no reproducible count on this base).

The fourth row got cheaper with the Phase-1 work in PR #3981: the two
`apply*` calls now carry their own catch, so a schema-level failure no longer
reaches the destructive recovery. Across several stores that scoping is what
keeps a partial load from persisting a mixed state.

### Why this is a decision rather than a task

The split is straightforward *if* tracking can be moved. It cannot today,
because ownership of the tracking is implicit — it is a side effect of
`toJSON()` happening to touch everything, documented only in a comment at
`:1067-1068` and pinned by a runtime test
(`settings.reactivityContract.component.test.ts`), not by a declared invariant.
Any optimisation to `toJSON()` — memoising it, cloning the object once instead
of indexing per field — silently un-saves the store. That fragility is worth
removing whether or not the split ever happens.

## Decision

Two decisions, in this order. The second is gated on the first.

**1. Autosave ownership becomes explicit, before any field moves.**

The single tracking effect is replaced by a declared list: each serialized
group names the stores it must read, and one coordinator effect iterates that
list. The invariant becomes *declared and testable* — "this list covers every
field in `PERSISTENCE_SCHEMA`" — instead of *emergent from an index read*.
Equivalence with today's behaviour is proven by the existing reactivity
contract, extended to fail on a group that is missing from the list rather than
on a field that stopped being read.

**2. Fields move into N rune-holding sub-stores behind a facade, and
`settingsState` keeps its name.**

`settingsState.<field>` stays the public surface via getters, so the 97 files
do not change. `toJSON()`/`apply*()` are driven from the schema, which already
carries the grouping (`field.section`). Each sub-store holds its own `$state`
fields; the coordinator reads them all.

`update()` is deleted in step 1 rather than migrated — it has no production
caller, and keeping a flat `Object.assign` facade over nested stores would
recreate the coupling this is meant to remove.

## Consequences

### What this enables

- AC 3 becomes achievable, and the god-module reduction is real rather than
  limited to function extraction.
- The autosave invariant stops depending on an optimisation nobody may make.
  Anyone can touch `toJSON()` without fear, which is the precondition for the
  rest of the schema work.
- The schema's `section` column stops being a driver detail and becomes the
  store partition, so adding a setting means one row and no wiring.

### What this costs

- 97 files keep compiling against getters that no longer own the state. Devtools
  and stack traces get one more hop; a debugger breakpoint on a field no longer
  intercepts a write.
- Cross-tab suppression becomes N flags. Every mute point is a chance to
  forget one, and a forgotten one turns another tab's write into an echo loop.
  This is the riskiest part of the change and wants its own test per store.
- `load()` gains a partial-apply mode. Today it is all-or-nothing; across
  stores it can be neither, and a mid-load failure must not persist a blend.
- Persistence stops being "one object, one JSON blob, one write". The blob
  shape stays (it is on disk in every user's browser), but the in-memory
  ownership no longer matches the storage shape, and anyone reasoning from the
  blob to the object has to cross that gap.

### What is now forbidden

- **No field may move out of a tracked store until the tracking list from
  decision 1 exists and is covered by the reactivity contract.** A PR that moves
  fields without it must be rejected; the failure mode is silent data loss, not
  a failing test.
- **No `$state` field may be added to `SettingsManager` outside a
  `PERSISTENCE_SCHEMA` row.** The list in decision 1 is generated from the
  schema, so an unlisted field is an untracked field. The exactness test in
  `persistenceSchema.test.ts` is what enforces this and must not be weakened to
  accommodate a new setting.
- **No sub-store may write another sub-store's field directly**, and no
  sub-store may read `settingsState`. Cross-store coordination goes through the
  same ports the other extracted lanes use.
- **`update()` must not be reintroduced**, in any shape. If a caller needs a
  multi-field write it gets a purpose-named method on the owning store.

## Alternatives considered

**Leave the class whole and stop asking.** Rejected: it is the honest option,
and it is what the FEAT-0342 status notes currently imply by not attempting
AC 3. But the fragility in decision 1 is a bug independent of the split — a
memoised `toJSON()` breaks the store today with no test to catch it. Doing
decision 1 alone is worth it even if decision 2 is deferred forever.

**Extract by file, move no fields (extend slices E/F).** Rejected as the goal:
this is what E and F already do, it produces pure functions over a
caller-supplied target, and it leaves 172 `$state` fields on one class. It is
the right *shape* for logic and the wrong answer to "isolated stores".

**A reactive proxy or `$state` proxy facade** so reads stay direct. Rejected:
it hides the ownership boundary rather than stating it, and every debugger and
trace gets harder to read for no gain a getter cannot provide.

**Move the tracking into `localStorage` writes only** — persist on an explicit
`commit()` after each mutation, no effect at all. Rejected: 172 fields with
~600 access sites means either missing a commit or scattering hundreds of them,
and the field is Class A, so a missed write is silent user data loss. The effect
is the right mechanism; only its ownership needs fixing.

**Split by feature domain** (appearance / trade / ai / accounts) rather than by
the schema's `section`. Rejected for now: the schema's grouping already exists,
is test-pinned, and matches what `applyCoreFields`/`applyDisplayFields` actually
route. A domain split is the better end state, but it introduces a second
partition that has to be reconciled with the first, and doing both at once makes
the tracking work unverifiable.