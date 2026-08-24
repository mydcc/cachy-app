---
id: FEAT-0301
title: Active 3D Duck companion integration and onboarding achievement
type: feature
status: in-progress
assignee: human
branch: feat/cachy-onboarding
priority: P2
milestone: M3
editions: [community, pro, private]
area: mascot
data_class: none
adr: none
depends_on: [FEAT-0300]
---

# FEAT-0301 — Active 3D Duck companion integration and onboarding achievement

> Sub-item of tracking epic [`FEAT-0299`](FEAT-0299-epic-first-time-user-onboarding.md).

## Problem

The 3D procedural Duck (`DuckLogic.ts`) acts as Cachy's interactive mascot and gamification pet, but remains completely passive during the user's initial onboarding experience. Connecting the onboarding flow with the 3D pet and achievement system provides immediate feedback, introduces the streak/XP mechanics playfully, and makes the app welcoming.

## Proposal

Integrate onboarding lifecycle events into `DuckLogic` and add a first-steps achievement:

1. **Duck Trigger Events (`src/lib/pets/types.ts`)**:
   - Add new event variants:
     ```typescript
     | { type: "onboarding_step"; step: number }
     | { type: "onboarding_complete" }
     ```

2. **Duck Logic Transitions (`src/lib/pets/DuckLogic.ts`)**:
   - `onboarding_step`: Transitions duck to attentive state (`DuckState.PETTING` for 1.2s).
   - `onboarding_complete`: Adds +25 XP, transitions to celebration jump/spin (`DuckState.CELEBRATING` for 3.0s), and evaluates new achievements.

3. **New Achievement (`src/lib/pets/DuckAchievements.ts`)**:
   - `ONBOARDING_COMPLETED`:
     - ID: `"onboarding_completed"`
     - Name Key: `"duck.achievements.onboarding_completed_name"` ("Startklar! 🦆" / "Ready to Trade! 🦆")
     - Description Key: `"duck.achievements.onboarding_completed_desc"` ("Das Onboarding erfolgreich abgeschlossen." / "Successfully completed the onboarding walkthrough.")
     - Triggered when `onboarding_complete` is dispatched.

4. **Integration with Onboarding Store**:
   - `onboardingState.next()` calls `effectsState.triggerDuckEvent({ type: "onboarding_step", step })`.
   - `onboardingState.complete()` calls `effectsState.triggerDuckEvent({ type: "onboarding_complete" })`.

## Acceptance criteria

- [ ] `DuckTriggerEvent` supports `onboarding_step` and `onboarding_complete`.
- [ ] Transitioning steps triggers attentiveness animation on the 3D duck.
- [ ] Completing the onboarding tour triggers `DuckState.CELEBRATING`, awards +25 XP, and unlocks `ONBOARDING_COMPLETED`.
- [ ] Achievement toast appears in the active locale (DE/EN).
- [ ] Vitest unit tests in `src/lib/pets/DuckLogic.test.ts` verify the achievement and event logic.
- [ ] `npm run check` passes.

## Links

- [`FEAT-0299`](FEAT-0299-epic-first-time-user-onboarding.md)
- [`FEAT-0300`](FEAT-0300-onboarding-spotlight-ui-and-content.md)
- [`src/lib/pets/DuckLogic.ts`](../../../src/lib/pets/DuckLogic.ts)
- [`src/lib/pets/DuckAchievements.ts`](../../../src/lib/pets/DuckAchievements.ts)
