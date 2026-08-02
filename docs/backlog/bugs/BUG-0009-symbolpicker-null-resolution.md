---
id: BUG-0009
title: SymbolPickerWindow resolves with null against a type that excludes it
type: bug
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

# BUG-0009 — SymbolPickerWindow resolves with null against a type that excludes it

## Symptom

Cancelling the symbol picker resolves its promise with `null`, a value its type
says cannot occur. A caller treating the result as always a string throws.

## Evidence

**Derived.** Full analysis: [`../../TODO.md`](../../TODO.md) item 10.

`modal.svelte.ts`'s `showModal()` builds `new Promise<boolean | string>(...)`
for the `symbolPicker` case. `SymbolPickerWindow.destroy()` calls
`resolve(null)` unconditionally when closed without a selection. `null` is
neither `boolean` nor `string`.

Whether it produces a visible bug depends on each caller; that has not been
audited.

## Fix

Either widen the return type to `Promise<boolean | string | null>` and handle
`null` at every caller, or resolve with `false` on cancel to match the existing
contract. Audit the callers before choosing — that audit is the work.

## Acceptance criteria

- [ ] Every `showModal(..., 'symbolPicker')` caller is listed in this item with
      how it handles a cancel
- [ ] A test cancels the picker and asserts the resolved value matches the
      declared type
- [ ] No caller can receive a value its handling does not cover

## Links

- [`docs/TODO.md`](../../TODO.md) item 10
- `src/stores/modal.svelte.ts`, `src/lib/windows/implementations/SymbolPickerWindow.svelte.ts`
