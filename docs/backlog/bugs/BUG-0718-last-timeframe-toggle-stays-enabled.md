---
id: BUG-0718
title: The last calculation-timeframe toggle stays enabled and silently refuses
type: bug
status: in-progress
assignee: opencode
branch: fix/ui-settings-reasons
priority: P3
milestone: none
created: "2026-10-21"
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

# BUG-0718 — The last calculation-timeframe toggle stays enabled and silently refuses

## Symptom

With one analysis timeframe left, its button still looks selected and clickable.
Clicking it does nothing. The count label next to the grid says "1 selected", so
the state is visible, but nothing says one is the minimum.

## Evidence

**Derived.** `src/components/settings/CalculationSettings.svelte:264-280`:

```svelte
<button
    class="timeframe-btn {isSelected ? 'selected' : ''}"
    onclick={() => {
        if (isSelected) {
            // Don't allow removing last timeframe
            if (
                settingsState.analysisTimeframes.length > 1
            ) {
                settingsState.analysisTimeframes = …
```

The guard is inside the handler; the button has no `disabled` or
`aria-disabled`, and no text states the minimum. Clicking a selected timeframe
is a normal way to "deselect" it, so the refusal is reached by ordinary use.

## Cause

The same shape as BUG-0712: the bound is enforced in the action, not in the
control's enablement.

## Fix

Mark the last selected timeframe as unavailable (with a visible reason, and
checked for keyboard reachability per the `IndicatorAlertAction` precedent),
or allow removing it and auto-select a replacement. Pick one; do not leave the
silent refusal.

## Acceptance criteria

- [ ] With one timeframe left, the control either communicates why it cannot be
      removed or removes itself and selects a replacement
- [ ] A test drives the one-left case

## Links

- Found by [FEAT-0606](../features/FEAT-0606-button-placement-visibility-and-dependency-audit.md)
- Evidence table: [`ui-zustandsaufnahme.md`](../assets/FEAT-0605/ui-zustandsaufnahme.md) §8.4
- Same class: [BUG-0712](BUG-0712-window-zoom-controls-stay-enabled-at-limits.md)
