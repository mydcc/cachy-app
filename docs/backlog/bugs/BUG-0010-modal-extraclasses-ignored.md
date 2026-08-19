---
id: BUG-0010
title: modalState.show() accepts extraClasses and never applies it
type: bug
status: done
priority: P3
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

- [x] The instructions modal renders at the intended width
- [x] A test asserts the class reaches the rendered root element
- [x] Alert, confirm and prompt dialogs are visually unchanged

## Resolution

**RESOLVED** (2026-08-10). `DialogWindow.svelte.ts` now takes `extraClasses`
as a constructor parameter (threaded from `modal.svelte.ts`'s `show()`,
which already had the parameter but never passed it on) and sets it on
`WindowBase.extraClasses` — the same field `ModalFrameWindow` already uses,
which `WindowContainer.svelte` → `WindowFrame.svelte` already applies to
the rendered root's `class` attribute for every window type. That alone
satisfies "the class reaches the root," but **not** "renders at the
intended width": `WindowFrame.svelte` binds width/height as inline styles
(`style:width`/`style:height`), which always beat a class-based CSS rule
regardless of specificity — confirmed live in the browser, and already
documented as the reason in the `themes.css` comment above
`.modal-size-instructions` before this fix (it called the CSS class
"currently inert" for this exact path).

So the actual size comes from a small `EXTRA_CLASS_SIZE_OVERRIDES` map in
`DialogWindow.svelte.ts` that sets `this.width`/`this.height` directly for
known presets (currently just `modal-size-instructions` → 1200×800),
mirroring how `WindowRegistry`'s `'academy'` entry already approximates
this exact same "80vw capped 1320px, 3:2" preset with fixed pixels instead
of relying on the CSS class, for the identical reason.

**A second bug found and fixed while verifying "alert/confirm/prompt
unchanged" live in the browser, not just by reading code:** the `'dialog'`
window type is `persistent: true` by default (no registry entry disables
it) and, since `allowMultipleInstances` is false for `'dialog'`, every
plain alert/confirm/prompt/instructions dialog shares one stable id
(`"dialog"`) and therefore one `localStorage` key. Without a distinct id,
the first time the instructions preset opened and resized to 1200×800,
that size would be restored by `restoreState()` for the *next* plain
alert too — reproduced exactly this in the browser before the fix (a
"Test Alert" dialog rendered at 1200×800 right after closing the
instructions modal). Fixed by giving any dialog with a size override its
own id (`dialog-${extraClasses}`), so its persisted state can never leak
into a plain dialog's. Since `'dialog'` is `isResizable: false`, there was
no user-facing resize behavior to preserve by *not* doing this.

Verified live in the browser (not just unit tests): instructions modal
renders at 1200×800 with the class present on `.window-frame`; a plain
alert opened immediately after renders at the registry default 450×250,
unaffected. `src/stores/modal.test.ts` (5 new/updated assertions,
including one that simulates the persisted-state leak via `saveState()`
and confirms it no longer crosses into a plain alert) — confirmed each new
test fails against the pre-fix code before making it pass.

## Links

- [`docs/TODO.md`](../../TODO.md) item 15
- `src/stores/modal.svelte.ts`, `src/services/uiManager.ts`
