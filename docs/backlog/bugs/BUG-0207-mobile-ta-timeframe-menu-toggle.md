---
id: BUG-0207
title: Mobile Technical Analysis timeframe menu fails to reopen
type: bug
status: done
priority: P2
milestone: none
editions: [community]
area: ui
data_class: none
adr: none
depends_on: []
start_date: 2026-08-15
target_date: 2026-08-16
size: XS
estimate: 1
---


# BUG-0207 — Mobile Technical Analysis timeframe menu fails to reopen

## Symptom

On mobile devices, in the Technical Analysis view, the Timeframe (TF) selection menu opens correctly on the first tap and successfully changes the timeframe. However, a subsequent tap on the TF button fails to reopen the menu. The user is forced to tap somewhere else on the screen ("into the void") to reset the state before they can open the menu again.

## Evidence

*Demonstrated* — Open the app on a mobile viewport. Go to Technical Analysis. Tap the timeframe button -> menu opens. Select a timeframe -> menu closes. Tap the timeframe button again -> nothing happens. Tap outside, then tap the button again -> menu opens.

## Cause

Likely a state management issue with the dropdown/menu component on touch devices. The component might rely on `onblur` or `focusout` events that don't trigger properly after a selection on mobile, leaving the internal state thinking the menu is still "open" or "focused" when it's visually closed, preventing the next tap from toggling it open.

## Fix

- Ensure the timeframe dropdown component correctly resets its open/closed state immediately upon selection.
- Verify touch event handling vs click event handling to ensure toggling works reliably without requiring an external click to blur.

## Acceptance criteria

- [x] On mobile, the TA timeframe menu can be opened, a selection made, and then immediately reopened without needing to tap outside first.

## Links

## What shipped

Shipped in merge main into develop for release 1.6.1.
