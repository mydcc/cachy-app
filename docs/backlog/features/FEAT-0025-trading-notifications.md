---
id: FEAT-0025
title: Notify on fills, margin thresholds and connection loss
type: feature
status: done
shipped: unreleased
assignee: claude
priority: P2
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: A
adr: none
depends_on: []
estimate: 5
size: L
target_date: 2027-01-15
start_date: 2026-08-01
---


Branch: `feat/feat-0025-trading-notifications`

# FEAT-0025 — Notify on fills, margin thresholds and connection loss

## Problem

A trader with the tab in the background finds out about a fill, a margin-ratio
climb or a dropped connection when they look. The last one is the worst: a
silently dead WebSocket means the displayed position state is fiction, and
nothing currently says so loudly.

## Proposal

Notifications for order fills and rejections, TP/SL triggers, liquidation
warnings, margin-ratio thresholds, and connection loss or degradation.
Per-category channel selection: in-app, browser notification, and optionally an
external channel the user configures.

**Connection loss is the priority case.** It must be visible in the UI itself,
not only as a notification that may be suppressed — stale data presented as live
is a money bug.

Configuration is Class A. Any external delivery channel is the user's own
endpoint, configured by them, and carries only what they chose to send.

## Acceptance criteria

- [x] Each category fires on its event, tested against simulated events
- [x] Connection loss is visible in the UI regardless of notification settings
- [x] Duplicate notifications are suppressed for one logical event
- [x] Browser notifications degrade gracefully when permission is denied
- [x] No Class A data reaches any Cachy-operated endpoint
- [x] German and English strings

## State

### Already satisfied when picked up

**Connection loss.** The item calls this the priority case, and it was already
handled where it has to be: `OfflineBanner.svelte` renders on
`marketState.connectionStatus`, in the app itself, with no setting able to
suppress it — plus a reconnect and a switch-venue action, and its own component
test. Nothing was added, and deliberately no category was created for it: a
toggle would imply it can be switched off, and stale data presented as live is
a fault rather than a preference.

`BUG-0008`, named here as a prerequisite, is likewise already `done`.

### What this change added

`lib/notificationPolicy.ts` (catalogue, defaults, duplicate key),
`stores/notifications.svelte.ts` (Class A choices) and
`services/notificationService.svelte.ts` (delivery, suppression, browser
permission), plus per-category toggles beside the confirmation settings.

Events come from a transition observer on `omsService.updateOrder`, registered
at startup the way the gate hooks are. It reports a *transition*, not a state:
a venue repeats a terminal status across a REST poll and a WebSocket push, and
an observer told about the state would announce the same fill twice. Optimistic
orders are skipped — announcing one would tell the trader a fill happened
because the UI guessed it would.

Duplicate suppression is keyed on order and reached state, so the same fill
described twice is one event while a fill and a later cancel are two, and a
later copy carrying a rounder quantity is still suppressed.

Browser notifications are local: the OS renders them, nothing is transmitted.
That is the fifth criterion, and it is why permission is requested from the
settings toggle rather than at startup — an unprompted ask is what trains
people to refuse, and a refusal is permanent for the origin.

### Narrowed from the proposal, deliberately

**Three categories, not five.** Order fills, rejections and cancels have a real
event source in `omsService`. TP/SL triggers arrive as order transitions too and
will fold in once their status mapping is confirmed against a venue.
**Margin-ratio thresholds have no data**: `marginRatio` appears nowhere in
`src/`, and deriving one from margin and liquidation price would be Cachy's
arithmetic presented as the exchange's — the wrong kind of guess for a warning
a trader would act on. **Liquidation warnings** need a threshold definition
(how close is close) that the item does not give.

**No external channel.** The proposal offers one "optionally". It is the single
path by which Class A data could leave the device, so it belongs in its own
item with its own review rather than riding along with the plumbing.

Both gaps are the same shape as asset mode in FEAT-0020 and trailing stops in
FEAT-0023: the feature is not blocked by Cachy, it is blocked by data that does
not exist yet.

## Links

- `src/services/connectionManager.ts`, `src/services/toastService.svelte.ts`
- [`BUG-0008`](../bugs/BUG-0008-toast-array-unbounded.md) — fix before adding volume
