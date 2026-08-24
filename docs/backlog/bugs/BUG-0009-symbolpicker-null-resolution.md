---
id: BUG-0009
title: SymbolPickerWindow resolves with null against a type that excludes it
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
start_date: 2026-08-01
target_date: 2026-08-13
size: XS
estimate: 1
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

- [x] Every `showModal(..., 'symbolPicker')` caller is listed in this item with
      how it handles a cancel
- [x] A test cancels the picker and asserts the resolved value matches the
      declared type
- [x] No caller can receive a value its handling does not cover

## Resolution

**RESOLVED** (2026-08-10). Caller audit (grep across `src/` for
`modalState.show(...)`) found exactly one caller of the `'symbolPicker'`
type: `src/stores/modal.test.ts:71` — no production code calls
`modalState.show(..., 'symbolPicker')` today. The two other places that
construct `SymbolPickerWindow` (`TradeSetupInputs.svelte:444`,
`hotkeyService.ts:280`) both call `new SymbolPickerWindow()` with **no**
`resolve` argument — `this.resolve` stays `null`, so `destroy()`'s
`if (this.resolve)` guard means neither of them was ever affected by this
bug in the first place.

Chose the "resolve with `false` on cancel" option from the Fix section
over widening the type, since `DialogWindow.svelte.ts` — the sibling
implementation `modal.svelte.ts` uses for every other modal type — already
does exactly that (`this.resolve(false)` in its own `destroy()`). Made
`SymbolPickerWindow.svelte.ts` match it: `destroy()` now resolves `false`
instead of `null`, and the `resolve`/`closeWith` signatures are narrowed
from `any` to `boolean | string` / `string` (matching `DialogWindow`'s
typed `resolve`, and `SymbolPickerView.svelte`'s one `closeWith()` call
site, which always passes a `string`). No caller needed changes.

Verified by a new test in `src/stores/modal.test.ts`: opens the symbol
picker, calls `destroy()` to simulate cancel, and asserts the resolved
value is `false`, not `null` — confirmed to fail against the pre-fix code.

## Links

- [`docs/TODO.md`](../../TODO.md) item 10
- `src/stores/modal.svelte.ts`, `src/lib/windows/implementations/SymbolPickerWindow.svelte.ts`

## What shipped

Shipped in 1.3.0-beta.11.
