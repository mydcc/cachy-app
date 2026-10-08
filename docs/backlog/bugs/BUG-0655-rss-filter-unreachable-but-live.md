---
id: BUG-0655
title: rssFilterBySymbol is unreachable but still filters for users who set it before 2026-01
type: bug
status: in-progress
assignee: opencode
branch: fix/drop-dead-settings-fields
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: A
adr: none
depends_on: []
---

# BUG-0655 — rssFilterBySymbol is unreachable but still filters for users who set it before 2026-01

## Symptom

RSS news filtering by the chart symbol stopped being switchable on 2026-01-24 and
nobody noticed, because the setting kept working. For anyone who had switched it
on before that date, `newsService` still filters their RSS items by the chart
symbol. There is no longer any way to turn it off, and no UI that says it exists.

## Evidence

**Derived, and demonstrated for the removal that was considered.**

- *Derived* — the binding existed and was deleted.
  `IntegrationsTab.svelte` carried `<Toggle bind:checked={settingsState.rssFilterBySymbol} />`
  plus its label and description. Commit `e12f93390` ("Settings Restructuring",
  2026-01-24, version 0.94.3, which introduced the six-tab settings layout)
  removed all three lines. `git log --all -S "rssFilterBySymbol" -- "*.svelte"`
  returns exactly two commits: the one that added the binding and the one that
  removed it.
- *Derived* — the filter itself still works.
  `src/services/newsService.ts:358` reads the field and filters on
  `matchesSymbol(item.title, symbol) || matchesSymbol(item.url, symbol)`. BUG-0652
  closed the field's round-trip, so a stored `true` survives load and the branch
  fires. It is unreachable, not dead.
- *Demonstrated* — the four translation keys are dead now.
  `settings.rssFilterBySymbol`, `settings.rssFilterBySymbolDesc` and their
  `settings.integrations.*` counterparts are populated in both `de.json` and
  `en.json`, and no component references any of them.

## Cause

A UI reorganisation deleted the control without deciding what the setting should
become. The persistence layer kept it, so the behaviour for existing users stayed
correct and the removal stayed invisible — no error, no dead code, nothing for a
test to catch.

## Fix

**Keep the field and the filter; remove the four dead translation keys.** The
setting is a compatibility shim: the branch it guards is still live for users
carrying `true`, and it costs one `if`. Removing the field would silently
unfilter exactly those users, with no migration and no message, and there is no
telemetry to size the affected group — settings are Class A and never leave the
device.

Restoring the toggle is a separate decision, because `IntegrationsTab` no longer
exists and the six-tab layout has no obvious home for it. It is a product
question, not a cleanup.

## Acceptance criteria

- [ ] The four translation keys are gone from `de.json` and `en.json`
- [ ] `schema.d.ts` regenerated and in sync
- [ ] `newsService` and its tests unchanged — the branch still serves stored `true`
- [ ] A stored `rssFilterBySymbol: true` still filters, covered by a test
- [ ] The item records that the field is deliberate, so a later reader does not
      file this as dead code again

## Out of scope

Restoring the toggle. If that is wanted, it needs a place in the current
six-tab layout and a decision about whether the shim then becomes live again.

## Links

- `src/services/newsService.ts:358` — the filter branch that stays
- `src/stores/settings.svelte.ts` — the field that stays
- BUG-0652 — made the field round-trip, which is why it still works