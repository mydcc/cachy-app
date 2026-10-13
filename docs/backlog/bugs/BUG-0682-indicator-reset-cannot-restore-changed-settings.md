---
id: BUG-0682
title: Indicator reset cannot restore settings the trader has changed
type: bug
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: A
adr: none
depends_on: []
---

# BUG-0682 — Indicator reset cannot restore settings the trader has changed

## Symptom

Once a trader has changed any indicator setting, the reset action no longer
returns it to the values the app ships with. The "default" it restores to is the
value they just changed, so a mistaken edit cannot be undone by resetting, and
anything that reads the module-level defaults as "how a new install looks" reads
the trader's edits instead.

## Evidence

**Derived.** Nobody has reported it; the defect follows from two sites that
disagree about what `defaultSettings` means.

`src/stores/indicator.svelte.ts:237` initialises each field *from* the same
literal the reset later restores *from*, so the reactive proxy and the literal
are the same object:

```ts
rsi = $state(defaultSettings.rsi);
```

The settings UI binds that proxy directly (`bind:value={indicatorState.rsi.length}`
in `src/components/settings/tabs/IndicatorSettings.svelte`), so the write lands in
`defaultSettings.rsi.length` itself. `reset()` then reads the mutated object back
out as the default (`src/stores/indicator.svelte.ts:541,547`):

```ts
const d = defaultSettings;
…
this.rsi = d.rsi;
```

Confirmed during FEAT-0681's review: a unit test that writes
`indicatorState.rsi.length = 21` and then reads the module literal back observes
21, not the shipped 14.

## Cause

The store's fields are `$state` proxies over the objects the defaults literal
holds, rather than over copies of them, so the literal is a live store of the
trader's edits and cannot also serve as the record of what shipped.

## Fix

Initialise each field from a copy (`$state({ ...d.rsi })`, or one deep clone of
the literal taken once), or hand out copies from `reset()`. Leave the field names,
the persistence shape and the existing `shippedIndicatorDefaults()` in
`indicator.svelte.ts` alone — that copy is correct and stays.

## Acceptance criteria

- [ ] A test writes a setting through the store, calls `reset()`, and asserts the shipped value is back
- [ ] A test writes a setting through the store and asserts the module-level defaults object is unchanged
- [ ] The persistence round-trip (save, reload, load) still restores a stored value

## Links

- `src/stores/indicator.svelte.ts` — the aliasing initialisers and `reset()`
- `src/components/settings/tabs/IndicatorSettings.svelte` — the writes that reach the literal
- FEAT-0681 — found while reviewing its settings-derived lesson parameters
