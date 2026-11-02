---
id: FEAT-0771
title: Tell the user when stored window rules are dropped on load
type: feature
status: in-progress
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: A
adr: none
depends_on: [FEAT-0743]
assignee: opencode
branch: feature/feat-0771-rule-drop-notice
size: S
estimate: 2
---

# FEAT-0771 — Tell the user when stored window rules are dropped on load

## Problem

A window rule is something the user configured and expects to keep. With the
trimmed rule-type list (PR #4463) the stored rules for the removed types are
discarded while settings load. Nothing says so. A user opens *Einstellungen →
Optik & Design → Fensterregeln* and finds fewer rules than they created — no
explanation, no date, no way to get them back. From their side the editor lost
their work.

The discard itself is correct: those window types can no longer carry a rule,
and keeping an inert entry would only hide the problem behind a card that does
nothing. What is missing is the message.

## Proposal

Report the discard once, where the rules live. The load path already rejects
those entries; it should also count them and remember which `windowType` values
they named. The Window rules section then shows a one-time notice naming the
count and the affected types, dismissible, remembering the dismissal so it does
not return on every start.

Nothing is restored. The removed types have left the picker, so a restored rule
would be rejected again on the next load. The notice explains the loss; it does
not undo it.

## Acceptance criteria

- [ ] The rule sanitiser reports how many entries it discarded and which
      `windowType` values they named, alongside the surviving list, and a caller
      that only needs the list keeps working unchanged.
- [ ] A payload with nothing to discard produces no notice, no reserved space
      and no stored dismissal flag.
- [ ] The Window rules section shows the notice only while the last load
      discarded at least one entry and the notice has not been dismissed.
- [ ] The notice names the count and the affected window types, in German and
      English.
- [ ] Dismissing it persists across reloads; the notice does not come back.
- [ ] A payload that mixes valid rules with removed types keeps every valid rule
      and reports only the removed ones.
- [ ] Unit tests cover a mixed payload, the zero case and the dismissal
      persistence; the component test covers rendering and the dismiss action.
- [ ] No hardcoded colours, Svelte 5 runes only, `npm run check` stays at 0
      errors.

## Decisions

- **In the section, not a toast.** A toast can fire while the user is on the
  dashboard and be gone before they look. The section is where the missing
  rules are noticed; a stored dismissal keeps the notice alive until it has
  been seen.
- **Count and types, not the discarded rules themselves.** Showing their
  geometry would suggest it can be re-applied to something, which it cannot —
  the target types left the picker.
- **One notice, not a migration log.** This is the first and only time the rule
  list narrowed. A general mechanism for sanitised settings would be built for
  a single caller.

## Out of scope

- Restoring, converting or inertly keeping the discarded rules.
- A general persistence-migration or notification framework for sanitised
  settings.
- Warning about *future* removals before they happen — that is a job for the
  release notes.

## Open questions

None blocking. The exact German wording of the notice belongs to the
implementation PR, not to this item.

## Links

- `src/lib/windows/windowRules.ts` — `sanitizeWindowRules`, `WINDOW_RULE_TYPES`
- `src/components/settings/tabs/VisualsLayout.svelte` — the Window rules section
- `docs/backlog/features/FEAT-0743-window-rules.md` — the rules slice
- PR #4463 — the trim that created the silent loss
