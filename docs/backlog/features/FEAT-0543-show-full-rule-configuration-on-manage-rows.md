---
id: FEAT-0543
title: Show full rule configuration on each Manage row
type: feature
status: ready
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
actually is or how it is configured. Each row shows only symbol plus a price
threshold (`formatCondition` over `op`/`threshold`); indicator alerts, combos
and candlestick patterns render an empty condition string. The panel footer
below the list (lifecycle fields + sentence) describes the *new draft being
built*, not the selected row — so the screen answers "what am I looking at?"
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
   no longer be misread as the selected row's settings.
4. Keep the row's delete behaviour unchanged; expansion is display-only.

## Acceptance criteria

- [ ] An indicator alert row expands to its full sentence (e.g. RSI params,
  operator, threshold) instead of an empty string
- [ ] A combo alert row expands to all legs with the same joining words the
  footer sentence uses
- [ ] Expanded detail shows timeframe, evaluation mode, frequency, validity,
  channels and note where set; unset optional fields show nothing (no
  placeholder noise)
- [ ] The footer can no longer be mistaken for the selected row's settings
  (verified by inspection in both locales)
- [ ] No heavy per-row computation in the template: rows prepared via
  `$derived` beforehand per project convention

## Out of scope

- Editing from the row (FEAT-0542)
- Bot rows: bots stay filtered out of Manage (`!isBot`) and live on the
  Automation tab
- Changing `alarmRows()` shape for other consumers; extend, don't rename

## Open questions

None blocking. If expanded sentences get long on small screens, clamp with
details/summary semantics rather than truncating content.

## Links

- `src/components/alerts/tabs/ManageTab.svelte` (row list, `formatCondition`)
- `src/services/alertEngine/ruleLifecycleView.ts` (`alarmRows`, `AlarmRow`)
- `src/lib/rules/ruleSentence.ts` (`renderRuleSentence`,
  `renderConditionSentence` — reuse, do not duplicate)
- `src/components/alerts/AlertPanelView.svelte` (footer ownership)
- `src/locales/locales/{de,en}.json` (both locales for every new string)
