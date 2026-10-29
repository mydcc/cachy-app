---
id: BUG-0755
title: A disabled rule still renders as armed in Manage
type: bug
status: done
assignee: opencode
branch: fix/bug-0755-suspended-rule-status
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

# BUG-0755 — A disabled rule still renders as armed in Manage

## Problem

`enabled: false` is how the app suspends a rule it cannot trust: its drawing was
deleted, or the rule was orphaned during reconciliation. Manage does not read
that field. A suspended rule appears in "Aktiv" with the same status a live
alarm has, and the list offers no hint that it will never fire.

The contradiction is visible in one screen: the reconciliation banner above the
list says a rule was suspended, while the row below it says the rule is armed.

## Evidence

Derived from reading the code; no runtime reproduction yet.

- `src/services/alertEngine/ruleLifecycleView.ts:141-149` — `lifecycleOf` reads
  `fired_count`, `valid_until_ms` and nothing else. `enabled` is copied into the
  row (`:126`) but never consulted.
- `src/components/alerts/tabs/ManageTab.svelte` never reads `row.enabled`; it
  renders `status` only.
- Three writers set `enabled: false`:
  `armRule.ts:240` (`disarmRule`, used after a `once` firing),
  `reconcileDrawingRules.ts:143` (drawing deleted or unverifiable),
  `reconcileOrphanedRules.ts:218` (rule could not be reconciled).
- The disarmed-after-firing case is masked by `fired_count > 0`; the two
  reconciliation paths are not, because a rule that never fired has
  `fired_count === 0` and therefore reports `"armed"`.

## Proposal

Make the row answer "will this fire if the market moves?" — not "does it have a
status".

1. `lifecycleOf` gains a disabled branch: `enabled === false` yields a distinct
   status (for example `suspended`) regardless of `fired_count`.
2. The row renders it as text ("Suspended — drawing deleted", "Suspended — could
   not verify"), using the reason the reconciliation reports already carry.
3. A suspended rule is not counted as active in the header count.
4. Re-enabling is not invented here: FEAT-0542/0746 own editing and pausing. But
   the row must at least name the state, so a trader does not wait for an alarm
   that cannot fire.

## Acceptance criteria

- [x] A rule with `enabled: false` and `fired_count === 0` never renders as
      armed in any list.
- [x] The drawing-suspension and orphan-suspension paths produce a distinct
      status, and the row names the reason the report names.
- [x] The status works for rules already suspended before the fix: no migration,
      no stored state change — `enabled` is read at render time.
- [x] A rule that fired (`fired_count > 0`) and is disabled keeps its "fired"
      marker; the two facts do not overwrite each other.
- [x] Tests cover both reconciliation paths. The Manage list has no active
      count today; a suspended rule stays in the list with its badge, and
      counts belong to FEAT-0747.
- [x] Both locales resolve the new labels; the state is text, not colour-only.

## Out of scope

- Re-enabling a suspended rule — FEAT-0542 (edit) and FEAT-0746 (pause/resume).
- The list redesign — FEAT-0747.
- Changing when reconciliation suspends a rule.

## Result

`lifecycleOf` now returns `suspended` for `enabled === false`, after the
`fired` check: a rule that announced itself keeps its fired marker even when the
firing path disarmed it, while a rule suspended by reconciliation is no longer
shown as armed. `enabled` is read at render time; no migration and no stored
change.

The row renders a text badge and carries the reason the reports already have:
"drawing was deleted" when `drawingReport.suspended` owns the id, "source alert
could not be reconciled" when `orphanReport.suspended` does, and a generic
"disabled" hint otherwise (the firing path leaves no report entry). The badge
is text, not colour-only, in both locales.

Pinned by `ruleLifecycleView.test.ts` (suspended, fired-beats-suspended,
alarmRows status) and `ManageTab.component.test.ts` (drawing reason, orphan
reason, generic reason, fired+disabled keeps the fired badge).

## Open questions

None. The proposed header count does not exist in this list; FEAT-0747 owns
list counts. A suspended rule stays in the list with its badge.

## Links

- `src/services/alertEngine/ruleLifecycleView.ts` — `lifecycleOf`, `AlarmRow`
- `src/services/alertEngine/reconcileDrawingRules.ts`
- `src/services/alertEngine/reconcileOrphanedRules.ts`
- `src/services/alertEngine/armRule.ts` — `disarmRule`
- `src/components/alerts/tabs/ManageTab.svelte`
- [`FEAT-0542`](../features/FEAT-0542-view-and-edit-armed-alert-from-manage.md)
- [`FEAT-0746`](../features/FEAT-0746-pause-resume-and-duplicate-armed-rules.md)
- [`FEAT-0623`](../features/FEAT-0623-audit-super-alert-system-gaps-and-design.md)
