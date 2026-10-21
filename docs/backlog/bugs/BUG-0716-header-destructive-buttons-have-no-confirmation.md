---
id: BUG-0716
title: The header's reset and delete-preset buttons act without confirmation
type: bug
status: specced
priority: P2
milestone: none
created: "2026-10-21"
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

# BUG-0716 — The header's reset and delete-preset buttons act without confirmation

## Symptom

One click on the broom icon resets every trade-form input except symbol and
trade type. One click on the red trash icon deletes the selected preset. Both
sit in the same header cluster as the theme switch, and neither asks first.
Every comparable destructive action in the app — clearing the journal, resetting
the paper book, releasing the kill switch, factory reset — does ask.

## Evidence

**Derived.** Three call sites and the contrast cases:

- `src/routes/+page.svelte:379-387` — the delete button; its handler at `:384`
  calls `app.deletePreset(presetState.selectedPreset)`.
  `src/services/app.ts:381-391` removes the key and rewrites localStorage
  immediately.
- `src/routes/+page.svelte:391-399` — the reset button; its handler at `:395`
  calls `tradeState.resetInputs(true)`. `src/stores/trade.svelte.ts:571-585`
  assigns a deep copy of `INITIAL_TRADE_STATE`; only symbol and trade type
  survive.
- Contrast: `src/services/app.ts:287-296` (`clearJournal`) opens a confirm
  modal; `src/components/settings/PaperTradingSettings.svelte:80-92`
  (`resetBook`) does the same; `src/components/settings/tabs/SystemTab.svelte:168`
  confirms the factory reset.

The header buttons are one keystroke apart from the theme switch and carry only
a `title` as their label (`dashboard.resetButtonTitle`,
`dashboard.deletePresetTitle`).

## Cause

The header cluster grew as a row of icon buttons; the destructive two were
added with direct handlers and never routed through `modalState` like the
settings actions.

## Fix

Confirm both, through the existing `modalState.show(..., "confirm")` pattern,
with a message that names what is lost ("trade form" / preset name). Keep the
delete button disabled when no preset is selected — that part already works.

While in the file, align the trio `#preset-loader` / `#save-preset-btn` /
`#delete-preset-btn` on one interaction model: the loader applies on change,
save prompts for a name, delete would then confirm. The audit table in
`ui-zustandsaufnahme.md` §8.1 records the current mismatch.

## Acceptance criteria

- [ ] Reset asks before replacing the trade form, and cancelling leaves every
      field untouched
- [ ] Delete asks before removing the preset, and cancelling keeps it in the
      loader
- [ ] A component test covers both cancel paths
- [ ] The other destructive controls without confirmation are listed in the
      audit table, not silently fixed here

## Links

- Found by [FEAT-0606](../features/FEAT-0606-button-placement-visibility-and-dependency-audit.md)
- Evidence table: [`ui-zustandsaufnahme.md`](../assets/FEAT-0605/ui-zustandsaufnahme.md) §8.1
- Sequencing: [FEAT-0610](../features/FEAT-0610-extend-and-adopt-the-button-primitive.md)
  adopts the same header controls with unchanged handlers. Land this wrapper
  first, or make that pilot account for it.
