---
id: FEAT-0542
title: View and edit an armed alert from Manage
type: feature
status: done
assignee: opencode
branch: feature/feat-0542-edit-armed-alert-from-manage
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
   already use on mount. A drawing-anchored rule has no condition slot: load it
   by re-seeding `drawingDraft` from its ledger entry (`drawingAnchors`) and
   opening the Drawing tab.
3. Non-`notify` rules (bots) stay excluded from Manage editing — bots are
   managed on the Automation tab (see FEAT-0544). A migrated legacy alert
   without `action` loads as a `notify` draft.
4. Bump `alertState.rulesVersion` after an edit lands, the way `arm()` already
   does, so the list re-derives from `localStorage`.

## Acceptance criteria

- [x] Opening edit on a price alert shows its exact threshold, symbol,
  timeframe, evaluation mode, frequency, validity and note in the builders
- [x] Opening edit on an indicator/combo/candlestick alert shows all of its
  conditions without dropping legs (no BUG-0443-shape wipe on tab switch)
- [x] Arming after edit updates the existing rule (same `id`), no duplicate
  appears in Manage
- [x] Edit entry point is keyboard-reachable and labelled in both locales
  (DE/EN strings in `src/locales/locales/{de,en}.json`)

## Out of scope

- Showing the full configuration inline on the row itself (FEAT-0543)
- Editing a bot's order intent or stop (FEAT-0544, BUG-0541)
- Alert history export or duplication

## Result

`alertPanelState.loadForEdit(ruleId)` loads the stored rule into the draft and
opens the builder that can render it: a single price, indicator or pattern rule
gets its own tab; several legs, an unclaimed shape, or a leg anchored to another
timeframe open Combo — which either renders them or locks itself read-only while
the footer still edits the lifecycle. The rule keeps its `id` (so `armRule`
replaces instead of appending) and its `provenance`. Manage rows get a native
pencil button with a localised label; a failure says why in a toast: `missing`,
`unreadable` (rule store or drawing ledger), or a non-notification rule.

The Proposal named the drawing case; what it did not settle:

- A drawing-bound rule opens the Drawing tab from its anchor-ledger entry. If
  that ledger cannot be read, **every** edit is refused — the ledger is keyed by
  rule id, so the panel cannot tell which rules are bound, and showing one as a
  fixed price alert would let a trader edit a threshold the evaluator
  overwrites from the line. The strip keeps Manage beside Drawing, so the
  trader can return to the list without closing the panel.
- A one-shot rule is disarmed when it fires (`enabled: false`); a repeating rule
  stays enabled. The loaded draft sets `enabled: true` either way, because
  pressing Arm means armed. For a disarmed one-shot rule the arm press also
  clears its fire state (`clearRuleState`); the core's `once` frequency refuses
  to announce while `fired_count` is set, so the "armed" toast would otherwise
  describe a rule that can never fire.
- A stored entry that is not a complete rule is refused as `unreadable`
  instead of being loaded: `alarmRows` tolerates it so it can be deleted, but
  the shell would dereference its missing `conditions`.

Content hash: `strategyOf` strips `enabled`, `trigger_methods`, `frequency`,
`valid_until_ms` and `note`; any other field — conditions, symbol, trigger
timeframe, evaluation mode — changes it, and `armRule` then resets the rule's
evaluation anchors (BUG-0486). A bare re-arm of a fired one-shot rule changes
only `enabled`, so it keeps them. The journal content hash additionally excludes
`id`, `name`, `provenance` and `schema_version`. No journal field is rewritten
by this item.

Pinned by `alertPanel.loadForEdit.test.ts` (identity, tab choice, both ledger
branches, state resets, malformed entries), `ManageTab.component.test.ts` (the
row's pencil, focus, every toast), `AlertPanelView.component.test.ts` (document,
header, builder, footer, and clearing a fired rule's state),
`builderTabHandover.component.test.ts` (both legs survive a tab visit),
`createDrawingAlert.test.ts` (evaluation mode and provenance carried) and
`drawingAnchors.test.ts` (a throwing storage read is loss, not an honest empty).

## Decisions recorded by the implementation

- Non-notification rules stay uneditable here: `loadForEdit` refuses any stored
  `action.consequence_level` other than `notify`, which covers the current bots
  (`simulate`) and a future `send` level. A migrated rule without `action` is
  not a bot and gets a `notify` action on load.
- The edit affordance lives on the row, not behind a details view: one click,
  keyboard-reachable, and the builder it lands in can render the condition —
  Combo, read-only, when none can.
- `loadForEdit` returns what it found (`loaded` / `missing` / `bot` /
  `unreadable`) rather than a boolean, so the caller can say why nothing
  opened.

## Open questions

None. The content-hash question is answered under Result.

## Links

- `src/components/alerts/AlertPanelView.svelte` (shell, draft lifecycle)
- `src/stores/alertPanel.svelte.ts` (`blankDraft`, `setSlotCondition`, seed flow)
- `src/components/alerts/tabs/ManageTab.svelte` (row list, `deleteRow`)
- `src/services/alertEngine/armRule.ts` (`armRule`, `readRuleStore`)
- `src/services/alertEngine/drawingAnchors.ts` (the drawing binding)
- `src/services/alertEngine/ruleStateStore.ts` (`clearRuleState`)
- `src/services/alertEngine/ruleLifecycleView.ts` (`alarmRows`)
- `docs/adr/0001-local-first-boundary.md` (Class A: rules stay on device)
