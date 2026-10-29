---
id: FEAT-0543
title: Show full rule configuration on each Manage row
type: feature
status: done
assignee: opencode
branch: feature/feat-0543-manage-row-config
priority: P2
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: []
---

# FEAT-0543 — Show full rule configuration on each Manage row

## Problem

A trader looking at Super-Alert → Verwalten cannot tell what any alarm
actually is or how it is configured. Each row showed only symbol plus, for a
`compare`, the right-hand constant worded as a price crossing (`gt` →
"Crosses Up"); it never named what was compared. A `cross`, group, pattern,
position or account rule rendered an empty condition string. The panel footer
below the list (lifecycle fields + sentence) describes the *new draft being
built*, not the row above it — so the screen answers "what am I looking at?"
with the wrong rule's parameters.

## Proposal

1. Make each Manage row expandable to its full configuration, rendered from
   the stored `RuleDocument` (not the draft): condition sentence via the
   existing `renderRuleSentence` / `renderConditionSentence`
   (`src/lib/rules/ruleSentence.ts`), plus trigger timeframe, evaluation mode
   (`close` vs `intrabar`), frequency, validity period, trigger channels and
   note.
2. Reuse the sentence renderer rather than a second phrasing: it already
   covers compare/cross/pattern/position/account/group conditions in both
   locales, and the footer sentence proves it stays in step with the core.
3. Label the footer lifecycle fields unambiguously as belonging to the new
   alarm under construction (e.g. section heading "New alert"), so they can
   no longer be misread as the settings of the row above.
4. Keep the row's delete behaviour unchanged; expansion is display-only.

## Acceptance criteria

- [x] An indicator alert row expands to its full sentence (e.g. RSI params,
  operator, threshold) instead of a wrong price phrase or an empty string
- [x] A combo alert row expands to all legs with the same joining words the
  footer sentence uses
- [x] Expanded detail shows timeframe, evaluation mode, frequency, validity,
  channels and note where set; unset validity and note show nothing (no
  placeholder noise)
- [x] The footer can no longer be mistaken for the row above it: labelled
  **New alert** / **Editing alert**. Rendered check in English, key and value
  parity in German
- [x] No heavy per-row computation in the template: rows prepared via
  `$derived` beforehand per project convention

## Out of scope

- Editing from the row (FEAT-0542)
- Bot rows: bots stay filtered out of Manage (`!isBot`) and live on the
  Automation tab
- Changing `alarmRows()` shape for other consumers; extend, don't rename

## Result

Rows expand to the stored rule's sentence and lifecycle. `alarmRows()` carries
the parsed document on each row (`rule`, a `StoredRule` — fields beyond `id`
are not validated), so the sentence and metadata are prepared in the same
`$derived` rather than mapped in the template. The sentence comes from
`renderRuleSentence`; timeframe and evaluation mode appear in it and as
labelled scan fields. The detail is a native `<details>` whose summary is
`dashboard.alerts.configuration` and names the row's symbol.

Malformed entries keep their row, edit and delete actions but render no
detail; the preparation is total per row, so one hand-edited rule cannot take
the list down. A pre-`action` rule gets the same `notify` display fill
`loadForEdit` applies. Optional validity and note are omitted when unset;
channels omitted means the notification policy decides (the footer hint says
so). Frequency always shows its effective value, `once` when absent.

The footer heading says **New alert** for a fresh draft and **Editing alert**
after a Manage row was loaded.

Pinned by `ManageTab.component.test.ts` (disclosure opens, per-row detail,
indicator/combo/pattern, field values, intrabar, effective `once`, malformed,
non-array channels, unknown enums, pre-`action`, accessible name),
`AlertPanelView.component.test.ts` (heading New → Editing → New),
`ruleLifecycleView.test.ts` (the document travels on the row) and
`schema.test.ts` (DE/EN key and value parity).

## Decisions recorded by the implementation

- The full `renderRuleSentence`, not `renderConditionSentence`: a Manage row
  describes an armed alarm, which is the moment the sentence's lead is written
  for; the condition-only form exists for the notification.
- Timeframe and evaluation mode are deliberately shown twice — in the sentence
  and as labelled fields. Both come from the same document in the same
  `$derived`; the fields are the scan values, the sentence is the proof.
- Frequency always shows its effective value (`once` when absent); hiding it
  would hide that the rule disarms after its first fire. Channels are omitted
  when empty because empty means "the notification policy decides", not
  "announces nowhere" — the footer hint owns that explanation.
- Native `<details>` rather than persisted expansion state. The list re-derives
  on `rulesVersion` and on a locale change (the detail is localised); rows are
  keyed by rule id, so an open row stays open across both. Persisting the
  expansion state is nobody's item: FEAT-0747 excludes new persistence.
- A rule that fired and is disabled is still listed in History with its fired
  marker; the detail does not change the lifecycle view (BUG-0755 remains its
  own item).

## Open questions

None. Long sentences are handled by the native disclosure, not truncation.

## Links

- `src/components/alerts/tabs/ManageTab.svelte` (row list, `formatCondition`, detail)
- `src/services/alertEngine/ruleLifecycleView.ts` (`alarmRows`, `AlarmRow`, `StoredRule`)
- `src/lib/rules/ruleSentence.ts` (`renderRuleSentence`; `renderConditionSentence`
  was considered and rejected — a Manage row is the armed moment)
- `src/lib/alerts/lifecycleLabels.ts` (shared frequency/method/evaluation keys)
- `src/components/alerts/AlertPanelView.svelte` (footer ownership)
- `src/locales/locales/{de,en}.json` (both locales for every new string)
