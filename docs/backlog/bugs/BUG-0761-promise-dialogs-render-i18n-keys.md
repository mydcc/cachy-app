---
id: BUG-0761
title: Promise dialogs receive i18n keys and render them as literal text
type: bug
status: specced
priority: P3
milestone: none
created: "2026-10-31"
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

# BUG-0761 — Promise dialogs receive i18n keys and render them as literal text

## Symptom

Two dialogs show a translation key instead of a sentence. The confirmation
before clearing the journal is titled `modals.clearJournal.title` and asks
`modals.clearJournal.message`; the save-preset prompt is titled
`modals.savePreset.title` and asks `modals.savePreset.prompt`.

## Evidence

**Demonstrated** by reading the two ends of the call.

`src/services/app.ts:287-296`:

```ts
const confirmed = await modalState.show(
  "modals.clearJournal.title",
  "modals.clearJournal.message",
  "confirm",
);
```

`src/services/app.ts:321-327` does the same for `modals.savePreset.*`.
`modalState.show` passes both strings straight into `DialogWindow`
(`src/stores/modal.svelte.ts:28-70`), which stores them unmodified;
`DialogView.svelte` renders `win.message` through `{@html sanitizeHtml(...)}`
and the title through the window header. Neither calls `$_`.

The other callers pass translated text — `src/components/settings/PaperTradingSettings.svelte:80-92`
(`$_("settings.paper.resetTitle")`) and `SystemTab.svelte:168` among them — so
the two services are the outliers.

## Cause

No convention is written down: `modalState.show` accepts strings, and the
question of whether they are keys or copy was never settled. The service layer
translates nothing, so its two dialogs ship keys.

## Fix

1. Translate at the two call sites (`$_("modals.clearJournal.title")`, …) to
   match the components, or make `modalState.show` translate keys. Pick one and
   state it in the method's doc comment; do not leave both conventions.
2. A regression test that mounts a `DialogWindow` through `modalState` and
   asserts the rendered title is not a `modals.*` key would have caught this.

## Out of scope

- Restyling the dialogs.
- The header confirmations added by BUG-0716, which pass translated strings.

## Links

- BUG-0716 — found while adding the header confirmations
- `src/stores/modal.svelte.ts`, `src/lib/windows/implementations/DialogView.svelte`
