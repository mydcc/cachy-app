---
id: BUG-0651
title: The refusal that blocks the order is never announced to a screen reader
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

# BUG-0651 — The refusal that blocks the order is never announced to a screen reader

## Symptom

A trader using a screen reader places an order that the gate refuses. The panel
does not send anything. Nothing is spoken.

The message is on screen — it is rendered, in text, in the same place errors have
always appeared. A sighted trader reads it. Everyone else has to go looking for
it, and the moment it describes — "nothing was sent" — is exactly the moment it
would otherwise be missed.

## Evidence

**Derived**, and verified against the code rather than assumed.

The refusal reaches the trader through `uiState.showError()`
(`src/stores/ui.svelte.ts:414-417`), which sets `errorMessage` and
`showErrorMessage`. It does not raise a toast.

The message is then rendered at `src/routes/+page.svelte:485-491` inside a plain
`<div id="error-message">` with **no `role` and no `aria-live`**. A live region
has to be present in the DOM before its content changes; a container that never
announces cannot be made to announce by adding text to it.

## Cause

Accessibility was applied per-component rather than to the error surface. Several
notes inside `PlaceOrderPanel.svelte` carry `role="status"`, which makes the
pattern look present in the codebase while the one message that blocks the money
path has none.

## Fix

Give the error container live-region semantics, and decide the politeness level
deliberately:

- `role="status"` implies `aria-live="polite"` **and** `aria-atomic="true"`.
  Atomic means the whole region re-announces on every change rather than just the
  delta — acceptable for a short error line that appears once, wrong for anything
  that toggles per keystroke.
- `role="alert"` is the stronger option and is easy to overuse: it interrupts
  whatever the reader is saying. For a refusal the trader asked for by clicking,
  polite is probably right.

Whatever is chosen, the region must exist in the DOM before the message arrives.
Rendering it conditionally will work inconsistently across screen readers.

## Acceptance criteria

- [ ] The refusal is announced when `submit()` refuses an order
- [ ] The announcement is not atomic over unrelated content
- [ ] It does not interrupt unrelated speech (polite, not assertive) — or the
      reason for choosing assertive is written down
- [ ] Decided explicitly whether the standing "not current" note should announce
      at all. It toggles during ordinary typing, and announcing it on every
      keystroke would queue near-identical speech and delay the message that
      matters

## Out of scope here, deliberately

Adding `role="status"` to the per-keystroke notes inside `PlaceOrderPanel`. It
was proposed, tried in #3949, and withdrawn: `aria-atomic="true"` plus a note
that flickers on ordinary typing is the wrong combination, and it would have
added live-region semantics to five blocks unrelated to the defect while leaving
this one — the refusal — silent.

## Links

Found by review of #3949. The reviewer's own finding on that PR was withdrawn
after checking whether announcement was needed at all rather than assuming a
mechanism; the gap it had been aimed at is this one.

- `docs/backlog/bugs/BUG-0648-clearing-stop-keeps-stale-calculation.md`
