---
id: BUG-NNNN
title: One line describing the wrong behaviour, no trailing period
type: bug
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

# BUG-NNNN — Title

## Symptom

What goes wrong, from the outside. What a user sees or what money does.

## Evidence

**Demonstrated** or **derived**? Say which, plainly.

- *Demonstrated* — there is a reproduction, a failing test, or an observed
  incident. Say how to reproduce it.
- *Derived* — the defect follows from reading the code, but nobody has seen it
  happen. Say which two pieces of code disagree and quote them with file and
  line.

This distinction decides how the fix gets verified, so it is not a formality.
A derived bug needs a test that reproduces it *before* the fix, or the fix is a
guess. See "a fix that compiles is not a bug that existed" in
`docs/archive/engineering-log-2026-h1.md`.

## Cause

The actual mechanism, if known. "Unknown" is an acceptable answer and better
than a plausible guess.

## Fix

What to change, and what to leave alone.

## Acceptance criteria

- [ ] A test reproduces the defect and fails without the fix
- [ ] The test passes with the fix
- [ ] …

## Links
