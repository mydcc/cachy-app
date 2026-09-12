---
id: BUG-0443
title: A builder tab erases a rule it cannot read back
type: bug
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: []
size: S
estimate: 2
---

# BUG-0443 — A builder tab erases a rule it cannot read back

## Symptom

Opening a Super-Alert panel tab on a rule that tab cannot represent appears to
delete the rule's conditions rather than leaving them alone.

## Where

`src/components/alerts/tabs/IndicatorsTab.svelte`, the init-and-write-through
pair:

```
const initial = readIndicatorForm(alertPanelState.draft.conditions);
let chosenId = $state<string | null>(initial?.subject.id ?? null);

$effect(() => {
    if (!entry) {
        alertPanelState.setSingleCondition(null);
        return;
    }
    ...
});
```

When `readIndicatorForm` cannot represent the document it returns `null`, so
`chosenId` is `null`, so `entry` is `null`, so the effect writes
`setSingleCondition(null)` — which empties the condition group. The tab cannot
tell "the trader has not chosen an indicator yet" from "this document is not
mine to show", and treats both as "clear the rule".

## Why it matters

The draft is a Class A document that arms a real alert. A trader who builds a
price condition, clicks Indicators to look around, and clicks back has silently
lost the condition. The larger the rule, the worse the loss — and FEAT-0030 makes
five-condition rules possible.

## Evidence status

Read from the source while implementing FEAT-0030, **not reproduced**. The first
acceptance criterion below is to establish whether it actually fires, because the
reachable paths depend on whether the panel keeps one draft across tab switches.

`ComboTab.svelte` (FEAT-0030) already takes the other road: `readComboForm`
returning `null` locks the tab and disarms its write-through entirely, so an
unreadable document is shown as not-editable-here instead of being cleared. That
is the behaviour the other tabs should converge on.

## Acceptance criteria

- [ ] A component test establishes whether opening IndicatorsTab on a document
      it cannot read clears that document — confirming or refuting the reading
      above before anything is changed
- [ ] If confirmed: a tab that cannot represent the current document leaves it
      untouched, and says so, rather than writing `null`
- [ ] "No indicator chosen yet" and "this document is not mine to show" are
      distinguishable states in the tab, not one
- [ ] The same check covers PriceTab and CandlesticksTab, which share the
      init-and-write-through shape
- [ ] German and English strings for whatever the locked state says

## Links

- [`FEAT-0030`](../features/FEAT-0030-combined-alerts.md) — where this was found, and the tab that already fails closed
- [`FEAT-0389`](../features/FEAT-0389-super-alert-panel.md) — owns the tab shell
