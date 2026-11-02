---
id: FEAT-0770
title: Apply a window rule to an open window without reopening it
type: feature
status: done
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: [FEAT-0743, FEAT-0769]
assignee: opencode
branch: feature/feat-0770-apply-window-rule-now
---

# FEAT-0770 — Apply a window rule to an open window without reopening it

## Problem

A rule only takes effect the next time its window opens (FEAT-0743, kept in
FEAT-0769). To see what a rule does, a user has to close and re-open the
window — which also throws away whatever the window was showing (a chart's
scroll position, an article, an unsent note). The editor therefore cannot be
checked against its own effect, and a mistyped coordinate is only discovered
on the next open, by which time the rule is saved.

## Proposal

An explicit "Apply now" action on a rule card, applying that rule to the window
the user last worked in if it matches (same type, same symbol scope).

Deliberately not live preview: nothing moves while a field is edited, and the
window only changes when the action is pressed. That keeps the FEAT-0743
promise ("editing a rule never moves an open window") true for every path
except this one, which the user presses.

## Acceptance criteria

- [x] A rule card offers "Apply now" only while the window the user last
      worked in matches the rule (same type, same symbol scope); otherwise the
      action is disabled and names the reason.
- [x] Pressing it applies the rule's geometry through the same clamp path as a
      drag — never larger than the viewport, and any geometry change re-clamps
      the anchor so a size-only rule cannot leave the window mostly off-screen.
- [x] `isMaximized` and `isKeepAbove` re-stack correctly, including leaving the
      keep-above band when the rule says so, and a minimized or maximized window
      is restored to floating before a rectangle is applied to it.
- [x] The applied geometry becomes the window's snapshot immediately, so a
      reload keeps it instead of the rule silently winning on the next open.
- [x] A rule whose `windowType`, scope or `enabled` flag does not match the
      live window is refused by both the target predicate and `applyRuleNow`
      itself, and a rule with nothing to apply is refused with its own reason.

## Out of scope

- Automatic or continuous application (no tiling-window-manager behaviour).
- Applying one rule to several open windows at once.

## Decisions

- **The target is the last focused window that is not the editor, not
  `isFocused`.** The rules editor lives inside the settings window, so the
  literally focused window is the editor the moment the button is pressed and
  would match no rule. `WindowManager.lastActiveWindow` remembers the last
  window instead and excludes two groups: the editor itself, and types that can
  never carry a rule (`isRuleTarget`) — otherwise cancelling a modal would
  leave every card claiming no window is open. Rehydration clears the target,
  because opening a restored window is not the user choosing one. The
  trade-off is that a session in which no other window was ever focused leaves
  the action disabled with a reason.
- **The snapshot is written immediately.** An open-time rule lands in the
  snapshot on the next drag or close; here waiting would lose the applied
  geometry on reload while the rule (correctly) kept applying on the next open.
  Rule and snapshot agreeing is the point.
- **No separate undo.** The snapshot is the fallback: re-apply another rule,
  or drag the window back. Removing the rule prevents future applications but
  does not restore the previous rectangle, because the snapshot was already
  overwritten — that is the cost of writing it immediately.
- **A disabled rule cannot be applied.** The card's toggle already means "this
  rule does nothing", so the action is disabled with its own reason instead of
  applying behind the toggle's back.
- **A type-wide rule applies even when the focused chart has a scoped rule.**
  Pressing the button on that card is an explicit instruction about the window
  in front of the user, not the automatic precedence `findWindowRule` applies
  on open.
- **No live preview.** Nothing moves while a field is edited; only the button
  acts on a live window.

## State

Implemented on `feature/feat-0770-apply-window-rule-now`:
`ruleTargetsInstance` in `windowRules.ts`, `WindowBase.applyRuleNow` (with the
`applyRuleSize` helper the open path now shares), `WindowManager.restack` and
`WindowManager.lastActiveWindow`, and the per-card action in
`VisualsLayout.svelte`.

Known gap: the component test mocks `windowManager`, so it cannot prove the
button flips to enabled when a matching window is focused *after* the editor
has rendered — a plain object is not reactive. The reactive path is exercised
by production code only; closing it needs an integration test that mounts the
editor against the real singleton.
