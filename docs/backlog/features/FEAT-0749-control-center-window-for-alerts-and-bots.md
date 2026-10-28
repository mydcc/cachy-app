---
id: FEAT-0749
title: Control center window for alerts and bots
type: feature
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: ADR-0006
parent: FEAT-0745
depends_on: [FEAT-0747, FEAT-0748]
size: M
estimate: 5
---

# FEAT-0749 — Control center window for alerts and bots

## Problem

Alerts and bots are two halves of one workflow that live on two unrelated
surfaces. Alerts are managed inside the Super-Alert side panel, whose primary
job is authoring; bots are managed in Settings → Automation. A trader running
both has to remember which surface holds which, and Settings is a configuration
screen, not an operating desk: it answers "how is the app configured", not
"what is armed, what fired, what is paused".

The infrastructure to place a proper operating surface now exists: the
entry-point registry (FEAT-0731/0736) gives a surface an id, icon, placement,
opener and keyboard route, and the window system already provides snapping,
keep-above and a window switcher (FEAT-0737–0742).

## Proposal

1. **A registered window, "Alerts & Bots".** A `WindowBase` implementation
   (`WindowType: "controlcenter"`) per ADR-0006, non-modal and dockable, entered
   through the left rail via `src/lib/navigation/entry-points.ts`. It uses the
   window system's existing flags rather than inventing new ones, and opens
   full-screen below the narrow breakpoint.
2. **Three tabs.** `Alerts (n)`, `Bots (n)`, `Log (n)`. The Alerts and Log tabs
   mount the FEAT-0747 components; the Bots tab lists every `simulate` rule
   with its order-intent sentence from `renderRuleSentence` (side, size basis,
   size, stop), its provenance ("derived from alert …", from
   `provenance.derived_from_hash`), and its enable toggle through
   `setBotEnabled`. It can link to the intent editor (FEAT-0544) but never
   submits an order.
3. **One authoring surface.** A primary "New alert" action opens the existing
   Super-Alert panel with a blank draft. Chart right-click and the indicator
   card keep seeding that panel directly. The control center does not grow a
   second builder.
4. **The bell becomes the overview.** The bell in `LeftControlPanel.svelte`
   opens the control center on the Alerts tab; the Super-Alert panel stays one
   click away through "New alert". The existing
   `LeftControlPanel.component.test.ts` pins the old behaviour and must be
   updated deliberately with this decision, not deleted.
5. **One bot list.** Remove the bot list from `AutomationTab.svelte`; that tab
   keeps global notification and channel configuration and gains a link to the
   control center. Two lists of the same rules is how they drift.
6. Keyboard: the registry route and the window switcher both reach the window;
   focus moves into the list on open; Escape closes without arming or deleting
   anything.

## Acceptance criteria

- [ ] `entry-points.ts` contains the control center entry (unique id, icon,
      label/title/description, opener, rail placement, keyboard route), and the
      registry guard (FEAT-0736) is green with it.
- [ ] The bell opens the control center on the Alerts tab; "New alert" opens the
      Super-Alert panel blank; chart right-click and the indicator card still
      seed that panel directly.
- [ ] The Bots tab lists every `simulate` rule with side, size basis, size, stop
      and provenance, in both locales; enabling and disabling behaves exactly as
      it does in the Automation tab today.
- [ ] No order can be submitted from the control center. The order gate and the
      paper-trading check remain the only submission path.
- [ ] `AutomationTab` no longer renders a bot list; its tests assert the
      migration and the link to the control center instead of being deleted.
- [ ] The window is non-modal: the chart stays visible and clickable beside it;
      below the narrow breakpoint it renders full-screen; Escape closes it.
- [ ] The Alerts tab mounts the FEAT-0747 components rather than a second list
      implementation; a test or a static check pins that there is one list
      component.
- [ ] German and English strings exist for every new label.
- [ ] No server import or call is added. The architecture data-flow diagram is
      unchanged because no data crosses a boundary; the PR says so explicitly.

## Out of scope

- `send`-level bots and live execution (FEAT-0035).
- Backtests, new channels, new condition types.
- Replacing the Super-Alert panel; it remains the builder.
- Multi-device sync and the Android companion.
- A configurable dashboard/layout inside the window.

## Open questions

- Does the rail entry replace the bell, or do both coexist? Proposal: coexist.
  The bell is muscle memory; the rail entry is discoverability. Revisit after
  the first ship.
- Should the Bots tab hide when no bot exists? Proposal: no — an empty tab with
  "Promote an alert to a bot" is how the capability is discovered.

## Links

- `src/lib/navigation/entry-points.ts` — the registry
- `src/lib/windows/` — `WindowBase`, `WindowType`, implementations
- `src/components/shared/LeftControlPanel.svelte` — the bell
- `src/components/settings/tabs/AutomationTab.svelte` — the bot list to migrate
- `src/services/alertEngine/botStore.ts` — `readBots`, `setBotEnabled`
- [`FEAT-0731`](FEAT-0731-entry-point-registry-data-and-resolver.md) and
  [`FEAT-0736`](FEAT-0736-guard-the-entry-point-registry.md)
- [`FEAT-0747`](FEAT-0747-manage-list-with-search-filters-and-firing-log.md)
- [`FEAT-0748`](FEAT-0748-per-alert-delivery-channels-and-test-announcement.md)
- [`FEAT-0544`](FEAT-0544-inspect-and-edit-bot-order-intent-with-stop.md)
- [`ADR-0006`](../../adr/0006-one-window-stacking-authority.md)
