---
id: FEAT-0542
title: View and edit an armed alert from Manage
type: feature
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: []
---

# FEAT-0542 — View and edit an armed alert from Manage

## Problem

Once armed, an alert can never be inspected or changed. The Manage tab
(`Super-Alert → Verwalten`) offers only a delete button per row; the panel
draft always starts blank (`blankDraft()`), and `alertPanelState` has no
load-for-edit path. A trader who mistyped a threshold must delete the alert
and rebuild it from memory — including indicator parameters, frequency,
validity period and note.

## Proposal

1. Add `loadForEdit(ruleId)` (or equivalent) to `alertPanelState`: loads the
   stored `RuleDocument` into `draft` by id, keeping its `id` and `provenance`
   so arming writes back the same rule instead of a duplicate.
2. Each Manage row gets an edit affordance that loads the rule into the draft
   and switches to the builder tab owning its condition slot (price /
   indicators / candlesticks / combo), reusing the slot-hydration builders
   already use on mount.
3. Non-`notify` rules (bots) stay excluded from Manage editing — bots are
   managed on the Automation tab (see FEAT-0544). A migrated legacy alert
   without `action` loads as a `notify` draft.
4. Bump `alertState.rulesVersion` after an edit lands, the way `arm()` already
   does, so the list re-derives from `localStorage`.

## Acceptance criteria

- [ ] Opening edit on a price alert shows its exact threshold, symbol,
  timeframe, evaluation mode, frequency, validity and note in the builders
- [ ] Opening edit on an indicator/combo/candlestick alert shows all of its
  conditions without dropping legs (no BUG-0443-shape wipe on tab switch)
- [ ] Arming after edit updates the existing rule (same `id`), no duplicate
  appears in Manage
- [ ] Edit entry point is keyboard-reachable and labelled in both locales
  (DE/EN strings in `src/locales/locales/{de,en}.json`)

## Out of scope

- Showing the full configuration inline on the row itself (FEAT-0543)
- Editing a bot's order intent or stop (FEAT-0544, BUG-0541)
- Alert history export or duplication

## Open questions

None blocking. Content-hash semantics on edit (does changing the condition
change the hash and therefore journal linkage?) should be stated in the PR,
following how `setBotEnabled` documents hash-excluded fields.

## Links

- `src/components/alerts/AlertPanelView.svelte` (shell, draft lifecycle)
- `src/stores/alertPanel.svelte.ts` (`blankDraft`, `setSlotCondition`, seed flow)
- `src/components/alerts/tabs/ManageTab.svelte` (row list, `deleteRow`)
- `src/services/alertEngine/armRule.ts` (`armRule`, `readRuleStore`)
- `src/services/alertEngine/ruleLifecycleView.ts` (`alarmRows`)
- `docs/adr/0001-local-first-boundary.md` (Class A: rules stay on device)
