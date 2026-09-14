---
id: BUG-0472
title: AI trade-setup actions execute immediately unless the user opted into confirmation
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: security
data_class: A
adr: none
depends_on: []
size: S
---

# BUG-0472 — AI trade-setup actions execute immediately unless the user opted into confirmation

## Symptom

A model-suggested `setLeverage`, `setRisk`, `setAccountSize` or `resetSetup`
is applied to the live trading interface with no user approval, as long as the
user never enabled "confirm AI actions". Only a mathematically poor R:R forces
confirmation. A jailbroken or prompt-injected model can therefore silently
rewrite the user's risk posture.

## Evidence

**Derived** from reading the code (not observed live in the app).

- `src/stores/ai.svelte.ts:635`: `const confirmActions = (settings.aiConfirmActions ?? false) || forceConfirm;`
- `src/stores/ai.svelte.ts:649-661`: the `else` branch executes every parsed
  action immediately via `executeAction`.
- `src/stores/settings.svelte.ts:649`: `aiConfirmActions: false` by default.
- The only built-in override is the low-R:R guard at
  `src/stores/ai.svelte.ts:598-622`.

## Cause

The confirmation gate is opt-in instead of opt-out for risk-posture
mutations. The batch path treats "user said nothing" the same as "user
approved", so model output gains write access to entry, SL, leverage, risk %,
account size, symbol and full setup reset without a human in the loop.

## Fix

Force confirmation for risk-posture mutations regardless of the
`aiConfirmActions` toggle:

- Introduce a `RISKY_ACTIONS` set (`setLeverage`, `setRisk`, `setAccountSize`,
  `resetSetup`, `removeTakeProfit`, `setSymbol`) next to `executeAction` in
  `src/stores/ai.svelte.ts`; when a parsed batch contains any of them, set
  `forceConfirm = true` the same way the low-R:R guard already does.
- Benign actions (`setNotes`, `setTags`, display-only) keep the current
  toggle behaviour.
- Add one UI sentence where Server-Relay is offered stating that relayed
  prompts and context travel via Cachy infrastructure (same area, same PR).

Leave alone: the low-R:R guard, the action set itself, order placement (there
is none — actions only touch interface state).

## Acceptance criteria

- [ ] A test reproduces the defect (a `setLeverage` batch applied to
      `tradeState` without `confirmAction`) and fails without the fix
- [ ] With the fix, every batch containing a risky action lands in
      `pendingActions` when the toggle is off, and applies after `confirmAction`
- [ ] Benign-only batches still follow the `aiConfirmActions` toggle
- [ ] The relay copy string exists in DE and EN (`schema.d.ts` regenerated)

## Out of scope

- Changing which actions exist or what values they accept (see BUG-0474)
- Changing the order-placement flow (actions never place orders)
- Flipping the global `aiConfirmActions` default for benign actions

## Links

- `src/stores/ai.svelte.ts` (`processResponse` action handling, `executeAction`)
- `src/stores/settings.svelte.ts` (`aiConfirmActions` default)
- `docs/adr/0011-*` (trade-context consent; the same consent spirit applies)
