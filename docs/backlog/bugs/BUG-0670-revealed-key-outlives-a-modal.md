---
id: BUG-0670
title: A revealed API key stays in the DOM when a modal opens over the settings pane
type: bug
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: security
data_class: A
adr: none
depends_on: [BUG-0667]
---

# BUG-0670 — A revealed API key stays in the DOM when a modal opens over the settings pane

## Symptom

`AccountCard`'s reveal toggle renders an API key or secret as plaintext
(`type={shown.key ? "text" : "password"}`). Until BUG-0667, opening any modal
swept the settings pane, which unmounted those inputs — so a revealed key
disappeared from the DOM the moment the trader did anything else. Now the pane
survives a modal, so a key the trader revealed a moment earlier is still
rendered in plaintext behind (and after) the dialog.

Raised by a review swarm on BUG-0667, which had to decide whether the pane
outliving the modal was a privacy regression. It judged it defense-in-depth
rather than disclosure: the user had revealed the key themselves, seconds
earlier, and no data crosses a boundary that did not already cross it.

## Cause

Reveal state (`shown`) is local to the card and is only ever cleared by the
card's own toggle. Nothing hides a revealed field on any other event — not
losing focus, not another window taking focus, not a modal opening.

This was invisible before because the pane rarely outlived anything. It is now
visible because BUG-0667 made the pane survive a modal on purpose.

## Fix

Decide and implement one rule for "hide a revealed credential", then apply it.
Candidates, in preference order:

1. Hide when the card loses focus (`focusout` with a containment check) — the
   user's attention has moved, and it needs no knowledge of windows or modals.
2. Hide when the pane stops being the focused window, driven by the existing
   `isFocused` flag on `WindowBase` rather than by a new listener.
3. Leave it, and say so in the settings UI copy.

Do not add a timer-based auto-hide: a credential that vanishes mid-copy is its
own defect.

## Acceptance criteria

- [ ] A test reproduces the defect (revealed field still rendered after the
      event the fix targets) and fails without the fix
- [ ] The chosen rule is applied in exactly one place, not per field
- [ ] Revealing is still a deliberate, single click, and copying a revealed
      key still works
- [ ] German and English strings if any copy changes

## Out of scope

- Credential storage and encryption shape (FEAT-0333)
- The window-manager behaviour itself (BUG-0667)
- Any change to when credentials are read or sent

## Links

- BUG-0667 — the pane now survives a modal, which is what exposes this
- FEAT-0333 — credential storage shape
- `src/components/settings/AccountCard.svelte` — the reveal toggle