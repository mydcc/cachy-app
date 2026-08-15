---
id: BUG-0209
title: Inconsistent and poorly placed number input arrows (Leverage / Risk)
type: bug
status: specced
priority: P2
milestone: none
editions: [community]
area: ui
data_class: none
adr: none
depends_on: []
---

# BUG-0209 — Inconsistent and poorly placed number input arrows (Leverage / Risk)

## Symptom

The numeric input fields across the application lack a consistent, professional design for their increment/decrement arrows (steppers). 
- In the "Leverage" input, the native browser arrows are poorly placed (often overlapping text or appearing misaligned, as seen in screenshots).
- In the "Risk per Trade" input, the arrows are missing entirely.

## Evidence

*Demonstrated* — Visible in the UI when interacting with the Trade Setup form. The native `<input type="number">` spin buttons differ across browsers and look unpolished.

## Cause

The application relies on default browser styling for `<input type="number">` without standardizing the appearance of the spin buttons across all number inputs. Native spin buttons are notoriously difficult to style consistently.

## Fix

- Hide the native browser spin buttons using CSS (`::-webkit-inner-spin-button`, `::-webkit-outer-spin-button`, and `-moz-appearance: textfield`).
- Implement a custom, consistent UI for number inputs across the app (either floating custom +/- buttons inside the input, or dedicated stepper buttons).
- Apply this new standardized number input to both "Leverage" and "Risk per Trade" (and verify other numeric inputs).

## Acceptance criteria

- [ ] Native browser up/down arrows are removed from numeric inputs.
- [ ] A custom, professionally styled increment/decrement mechanism is implemented.
- [ ] "Leverage" and "Risk per Trade" both use the new consistent stepper UI.

## Links
