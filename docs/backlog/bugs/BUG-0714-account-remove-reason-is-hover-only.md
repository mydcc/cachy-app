---
id: BUG-0714
title: The remove-account button explains its disabled state only in a title
type: bug
status: specced
priority: P3
milestone: none
created: "2026-10-21"
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

# BUG-0714 — The remove-account button explains its disabled state only in a title

## Symptom

With a single exchange account configured, its `Remove` button is disabled and
the only explanation is a `title` attribute. A disabled native button is not
focusable, so keyboard users never see it; on touch there is no hover at all.
The screen-reader announcement is the button's name, `Remove`, with no reason.

## Evidence

**Derived.** `src/components/settings/AccountList.svelte:159-171`:

```svelte
<button
    type="button"
    class="action bg-danger-paired"
    disabled={!canRemove}
    title={canRemove
        ? undefined
        : $_("settings.connections.accounts.removeLastHint")}
    onclick={() => handleRemove(account)}
>
```

The hint exists as a translation; it just has no visible home.

## Cause

The reason was attached to the control instead of to the surface. The same
pattern appears on the destructive controls of other settings sections, but
there the explanation is rendered as a paragraph
(`CloudTab.svelte:196-205`) or the label changes
(`AiModelPicker.svelte:104-111`), so this is the outlier.

## Fix

Render the hint next to the button when it applies, or move the button to
`aria-disabled` with the reason as visible text. Do not keep a `title` as the
only channel.

## Acceptance criteria

- [ ] The last-account reason is visible without hover and reachable by keyboard
- [ ] A component test asserts the reason is in the DOM when the button is
      unavailable

## Links

- Found by [FEAT-0606](../features/FEAT-0606-button-placement-visibility-and-dependency-audit.md)
- Evidence table: [`ui-zustandsaufnahme.md`](../assets/FEAT-0605/ui-zustandsaufnahme.md) §8.4
