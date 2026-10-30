---
id: BUG-0754
title: An armed repeating rule disappears from the active list after firing
type: bug
status: done
assignee: opencode
branch: feature/feat-0747-manage-list
priority: P2
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: ADR-0012
parent: FEAT-0623
depends_on: []
size: S
estimate: 3
---

# BUG-0754 — An armed repeating rule disappears from the active list after firing

## Problem

A rule set to `every_time` or `once_per_candle_close` keeps evaluating after it
fires. The Manage list does not show it: the first firing moves it out of
"Aktiv" and into "Verlauf", where it stays forever, because `fired_count` is
never reset.

The trader looking at "Aktiv" sees a list that no longer contains an alarm that
is still armed and still evaluating. Nothing on the row says it is live, so the
honest reading is "this rule is done".

## Evidence

Derived from reading the code; no runtime reproduction yet.

- `src/services/alertEngine/ruleLifecycleView.ts:141-142` — `lifecycleOf`
  returns `"fired"` as soon as `fired_count > 0`, regardless of frequency or
  `enabled`.
- `src/stores/alerts.svelte.ts:156-158` — `isSpentAfterFiring` is true only for
  `(frequency ?? "once") === "once"`. A repeating rule is therefore *not*
  disarmed by the sink; it keeps running.
- `src/components/alerts/tabs/ManageTab.svelte:86-87` — "Aktiv" is
  `status !== "fired"`, "Verlauf" is `status === "fired"`. So the split is driven
  by "has ever fired", not by "is still armed".
- `src/services/alertEngine/ruleStateStore.ts` — `fired_count` is only ever
  incremented; `clearRuleState` has no production caller.

## Proposal

Separate "has fired" from "is retired". `fired_count` is a fact about the past;
the list split has to answer "is this rule still evaluating?".

1. `lifecycleOf` keeps returning the lifecycle status (`armed` / `expired`), and
   the fired fact stays a separate field on the row (`firedCount`).
2. Manage's "Aktiv" filters on "not retired": `enabled` and not expired. A rule
   that fired and is still armed stays there, with a "fired n×" marker.
3. "Verlauf" holds rules that are no longer evaluating — a `once` rule that
   fired and was disarmed, or an expired rule that never fired — so the tab
   means "past", not "has ever been heard".
4. The marker is text, not colour alone, and survives a reload because it reads
   `fired_count`.

This is the minimal correction; the list itself is redesigned by FEAT-0747,
which must keep this split when it replaces the components.

## Acceptance criteria

- [x] An `every_time` rule with `fired_count > 0` still appears in "Aktiv", with
      a visible "fired n×" marker.
- [x] A `once_per_candle_close` rule with `fired_count > 0` still appears in
      "Aktiv".
- [x] A `once` rule that fired is disarmed and appears in "Verlauf", not in
      "Aktiv". (FEAT-0747 replaced the two tabs with status chips; `Fired` is
      the status a spent one-shot rule carries, and it is the chip that
      replaces "Verlauf".)
- [x] An expired rule that never fired appears in "Verlauf". (Same redesign:
      it carries the `Expired` status and is reachable through that filter. It
      deliberately stays in the main list per FEAT-0393 AC 2 — a setup that
      lapsed untriggered is not one that fired.)
- [x] `lifecycleOf` no longer decides the list split on its own; a test pins
      that a fired repeating rule stays active.
- [x] The marker is readable by assistive technology, not colour-only, and both
      locales resolve it. (`manageList.firedTimes`, text in the row.)

## Out of scope

- Resetting `fired_count`, or a "clear history" action.
- The redesigned list, search and firing log — FEAT-0747.
- Pause and resume — FEAT-0746 (but this bug must not make a paused rule look
  active; see BUG-0755).

## Open questions

- Should "Verlauf" also list a paused rule that has fired? Proposal: yes, once
  pause exists — it is not evaluating, which is what the tab means.

## Links

- `src/services/alertEngine/ruleLifecycleView.ts` — `lifecycleOf`, `AlarmRow`
- `src/stores/alerts.svelte.ts` — `isSpentAfterFiring`, the firing sink
- `src/services/alertEngine/ruleStateStore.ts` — `fired_count`
- `src/components/alerts/tabs/ManageTab.svelte` — the Aktiv/Verlauf split
- [`FEAT-0747`](../features/FEAT-0747-manage-list-with-search-filters-and-firing-log.md)
- [`FEAT-0746`](../features/FEAT-0746-pause-resume-and-duplicate-armed-rules.md)
- [`BUG-0755`](BUG-0755-disabled-rule-renders-as-armed.md)
- [`FEAT-0623`](../features/FEAT-0623-audit-super-alert-system-gaps-and-design.md)
