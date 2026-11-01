---
id: FEAT-0770
title: Apply a window rule to the focused window without reopening it
type: feature
status: idea
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: [FEAT-0743, FEAT-0769]
---

# FEAT-0770 — Apply a window rule to the focused window without reopening it

## Problem

A rule only takes effect the next time its window opens (FEAT-0743, kept in
FEAT-0769). To see what a rule does, a user has to close and re-open the
window — which also throws away whatever the window was showing (a chart's
scroll position, an article, an unsent note). The editor therefore cannot be
checked against its own effect, and a mistyped coordinate is only discovered
on the next open, by which time the rule is saved.

## Proposal

An explicit "Apply now" action on a rule card, applying that rule to the
currently focused window if it matches (same type, same symbol scope).

Deliberately not live preview: nothing moves while a field is edited, and the
window only changes when the action is pressed. That keeps the FEAT-0743
promise ("editing a rule never moves an open window") true for every path
except this one, which the user presses.

## Acceptance criteria

- [ ] A rule card offers "Apply now" only while a window that the rule matches
      is focused; otherwise the action is disabled with a reason.
- [ ] Pressing it applies the rule's geometry through the same clamp path as a
      drag — never larger than the viewport, never off-screen.
- [ ] `isMaximized` and `isKeepAbove` re-stack correctly, including leaving the
      keep-above band when the rule says so.
- [ ] The applied geometry becomes the window's snapshot on its next save, like
      an open-time application.
- [ ] The action is unavailable for a window type the rule cannot target.

## Out of scope

- Automatic or continuous application (no tiling-window-manager behaviour).
- Applying one rule to several open windows at once.

## Open questions

- Should "Apply now" exist for every rule, or only while the rule's type is the
  focused window's type? (A global "apply to all matching" is a different
  action with a different undo story.)
- Does a rule applied this way count as a user gesture for the window's
  snapshot, or should it leave the snapshot untouched until the next drag?
- Undo: a single "restore previous geometry" step, or rely on the snapshot?
