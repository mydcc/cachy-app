---
id: BUG-0010
title: modalState.show() accepts extraClasses and never applies it
type: bug
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

# BUG-0010 — modalState.show() accepts extraClasses and never applies it

## Symptom

The instructions modal (dashboard/journal/changelog readme) renders at the
default dialog width instead of the wider layout it was written to use.

## Evidence

**Derived.** Full analysis: [`../../TODO.md`](../../TODO.md) item 15.

`modal.svelte.ts`'s `show(title, message, type, defaultValue, extraClasses)`
never reads `extraClasses`. `uiManager.ts`'s `showReadme()` passes
`"modal-size-instructions"` with a comment explaining exactly why. The class is
a real mechanism — `ModalFrame.svelte` applies its own `extraClasses` prop, and
`AcademyModal.svelte` uses it — but `modalState.show()` renders through
`DialogWindow` → `DialogView.svelte`, which has no such mechanism.

## Fix

Thread the class through `DialogWindow` (a new field, mirroring how it already
carries `title`/`message`/`type`/`defaultValue`) and apply it on
`DialogView.svelte`'s root, as `ModalFrame.svelte` does.

Touches the shared path every `modalState.show()` alert, confirm and prompt goes
through, so it needs a check that the other dialog types are unaffected.

## Acceptance criteria

- [ ] The instructions modal renders at the intended width
- [ ] A test asserts the class reaches the rendered root element
- [ ] Alert, confirm and prompt dialogs are visually unchanged

## Links

- [`docs/TODO.md`](../../TODO.md) item 15
- `src/stores/modal.svelte.ts`, `src/services/uiManager.ts`
