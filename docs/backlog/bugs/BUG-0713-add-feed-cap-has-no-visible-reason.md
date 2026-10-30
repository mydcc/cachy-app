---
id: BUG-0713
title: Adding a custom RSS feed disables at five with no visible reason
type: bug
status: done
priority: P3
milestone: none
created: "2026-10-21"
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

# BUG-0713 — Adding a custom RSS feed disables at five with no visible reason

## Symptom

The `+ Add feed` button under Settings → Connections stops responding once five
custom feeds exist. It has no tooltip, no counter and no text explaining the
cap, so it reads as a broken button rather than a reached limit.

## Evidence

**Derived.** `src/components/settings/tabs/ConnectionsTab.svelte:504-510`:

```svelte
<button
    class="text-xs … w-max"
    onclick={addCustomFeed}
    disabled={(settingsState.customRssFeeds?.length || 0) >= 5}
>
```

No `title`, no `aria-describedby`, and the surrounding block renders the feed
list without a count. The number `5` is inlined in the template; no named
constant carries it.

## Cause

The cap was added to the control only. Nothing else in the surface knows about
it.

## Fix

Name the cap (a module constant), show it next to the button
(`3 / 5` or the existing translation pattern), and give the disabled state a
reason that is visible without hover. Keep the button in the tab order with
`aria-disabled` if the reason is the only affordance, following the precedent in
`IndicatorAlertAction.svelte`.

## Acceptance criteria

- [x] The cap exists as one named value, used by the button and by the visible
      hint
- [x] The reached-limit state is readable without hover and announced to a
      screen reader
- [x] A test asserts the hint and the disabled state at the cap

## Links

- Found by [FEAT-0606](../features/FEAT-0606-button-placement-visibility-and-dependency-audit.md)
- Evidence table: [`ui-zustandsaufnahme.md`](../assets/FEAT-0605/ui-zustandsaufnahme.md) §8.4
