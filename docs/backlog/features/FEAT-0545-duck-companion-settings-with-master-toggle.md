---
id: FEAT-0545
title: Duck companion settings with master toggle in Visuals
type: feature
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: A
adr: none
depends_on: []
---

# FEAT-0545 — Duck companion settings with master toggle in Visuals

## Problem

The duck companion (`DuckLogic`) is always on and offers the trader no
control. It is unconditionally initialised in `FXOverlay.svelte`, reacts to
trade wins and losses (`tradeService.closePosition`/`flashClosePosition`),
toasts achievements as well as `duck.full`/`duck.annoyed` warnings through
`toastService`, and its only reset path is the Danger Zone full wipe. A trader
who finds a celebrating duck after a losing trade distracting — or who wants
no companion at all — has no recourse short of wiping all local data.

## Proposal

New Visuals sub-tab "Duck" (beside appearance/layout/background in
`VisualsTab.svelte`, driven by `uiState.settingsVisualsSubTab`), holding:

1. **Master toggle "Show duck" (default: on).** Off means frozen, not just
   hidden: `FXOverlay` skips `DuckLogic` initialisation, queued duck events
   are discarded without effect (no XP, no streak accounting, no toasts), and
   the pet click handler is inert. Re-enabling resumes from the stored
   `duck_dao_state` untouched.
2. **"Duck notifications" (default: on).** Off passes the silent notifier:
   achievements and XP keep accruing, but no achievement/full/annoyed toasts
   are shown.
3. **"React to trades" (default: on).** Off ignores `trade_win`/`trade_loss`
   events entirely — no celebrating/sad animation and no trade-derived XP
   bonus (stated plainly in the setting's hint text so nobody expects level
   progress from trades while it is off).
4. **"Reset progress" button with confirmation.** Clears only `duck_dao_state`
   (XP, level, streaks, feeds, achievements, onboarding flag) — a scoped
   reset, unlike the Danger Zone wipe. Replaying the onboarding tour afterwards
   legitimately re-earns the one-time reward (per `DuckLogic` semantics).

Settings live in the settings store (Class A, `localStorage`-only, like all
companion state). All strings in both `src/locales/locales/de.json` and
`en.json`. `Toggle` component, Svelte 5 runes, no hardcoded colours — the
usual settings-surface conventions.

Deliberately not included: duck position/size (hardcoded, no user ask),
sleep timeout (niche value, extra test surface), feed/pet frequency controls.

## Acceptance criteria

- [ ] With the master toggle off: no duck object in the scene, no XP growth
  across all event sources (feed, pet, trades, login, academy, onboarding),
  no duck toasts, pet clicks do nothing
- [ ] Re-enabling resumes from the previously stored `duck_dao_state`
  (level, XP, achievements intact)
- [ ] With notifications off: achievements still unlock and persist, but no
  toast is shown
- [ ] With trade reactions off: closing/flash-closing a position triggers no
  duck animation and grants no trade XP
- [ ] Reset clears only the duck key and asks for confirmation first; other
  local data is untouched
- [ ] New strings exist in DE and EN; component test covers toggle wiring
  (`*.component.test.ts` in the `components` Vitest project)

## Out of scope

- Changing duck geometry, animations, accessories or level thresholds
- Take-profit-style new companion behaviours or new event sources
- ATR/other new stop bases (other items); onboarding tour content itself
- Live/account-adjacent behaviour — the duck stays a purely local cosmetic
  companion (Class A, never leaves the device)

## Open questions

None blocking. If the settings store gains a schema version, the three
booleans default to `true` for existing installs so current behaviour is
preserved.

## Links

- `src/lib/pets/DuckLogic.ts` (state machine, notifier, `duck_dao_state`)
- `src/lib/pets/types.ts` (`DuckTriggerEvent`, `DuckDaoState`)
- `src/components/shared/FXOverlay.svelte` (init, duck-event handler, pet click)
- `src/stores/effects.svelte.ts` (`triggerDuckEvent` queue)
- `src/components/settings/tabs/VisualsTab.svelte` (sub-tab pattern)
- `src/services/tradeService.ts` (`closePosition`, `flashClosePosition` emitters)
- `src/utils/appReset.ts` (`wipeLocalData` — what reset must NOT do)
- `docs/adr/0001-local-first-boundary.md` (Class A)
