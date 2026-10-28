---
id: BUG-0753
title: External channel switched on in the policy but off on its card
type: bug
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: ADR-0018
parent: FEAT-0623
depends_on: []
size: S
estimate: 3
---

# BUG-0753 — External channel switched on in the policy but off on its card

## Problem

An external channel has two switches: the policy matrix in
Notification settings decides *which events* it may carry, and the channel card
decides whether the channel is *active at all*. With valid credentials and the
card's own switch off, the matrix still lets the trader switch the channel on —
and then nothing is delivered, with no trace.

The trader sees a matrix that says "Discord, on". They hear nothing, see no
error, and the delivery log stays empty. The state survives reloads.

## Evidence

Derived from reading the code; no runtime reproduction yet.

- `NotificationSettings.svelte` gates a matrix cell on
  `externalChannelsStore.problem(channel)`, which is
  `validateChannel(...)` — `src/stores/externalChannels.svelte.ts:90-92`.
  Credential validity only; the channel's `enabled` flag is not part of it.
- `ExternalChannelCard.svelte` has a separate enable toggle
  (`enabled`, `:118-123`) that is operable as soon as the credentials validate.
- Delivery gates on a different predicate:
  `notificationService.externalTargets()` → `isChannelActive(...)`, which is
  `config[channel].enabled && validateChannel(...) === null`
  (`src/lib/notifications/externalChannels.ts:214-220`,
  `src/services/notificationService.svelte.ts:237-245`).
- The skip writes nothing: `externalTargets` simply omits the channel, so
  `dispatchExternal` is never called and `externalDeliveryLog` records no
  outcome. The matrix shows no marker, because `needsSetup` is false.

So "configured" and "active" disagree in the one direction the UI does not
show. `notificationService.test.ts` ("does not dispatch on a channel switched
on but left unconfigured") pins the skip for an *unconfigured* channel; it does
not pin what the trader is told, and this case is different: the credentials are
valid.

## Proposal

1. Make the matrix gate match delivery: a cell is blocked (with a reason) unless
   `isActive`, not merely `validateChannel`. A channel that is configured but
   paused then reads as paused instead of as an available-but-silent option.
2. Give the two states distinct hints in the matrix: "needs setup" for missing
   or invalid credentials, "channel paused" for the card's switch, each pointing
   at the section that fixes it.
3. Belt for the braces: when a wanted channel is skipped at delivery time,
   record an outcome in `externalDeliveryLog` (`reason: "notConfigured"` or a
   new `"paused"`), so a skip is diagnosable after the fact even if a future UI
   path re-introduces it.

## Acceptance criteria

- [ ] With valid credentials and the card's switch off, the matrix cell for that
      channel cannot be switched on, or is visibly marked as paused with a hint
      that says which switch to flip.
- [ ] The matrix distinguishes "not configured" from "paused" in both locales.
- [ ] A delivery attempt on a wanted channel that is paused produces an entry in
      `externalDeliveryLog` rather than nothing — pinned by a test at the
      `notify()` boundary.
- [ ] A channel that is both configured and enabled is unchanged: it delivers,
      and its matrix cell stays operable.
- [ ] The predicate used by the matrix and by delivery is one function, so the
      two cannot diverge again.

## Out of scope

- Per-rule external channel selection — FEAT-0748.
- Changing the external channel API clients.
- Encrypting credentials (ADR-0018 decision 4).

## Open questions

- Should "paused by the card" be a third state in the matrix, or should the
  card's switch be the only place a channel is paused? Proposal: one switch per
  channel (the card), and the matrix simply refuses to claim what delivery will
  not do.

## Links

- `src/components/settings/NotificationSettings.svelte` — the matrix gate
- `src/components/settings/ExternalChannelCard.svelte` — the per-channel switch
- `src/stores/externalChannels.svelte.ts` — `problem`, `isActive`
- `src/lib/notifications/externalChannels.ts` — `validateChannel`,
  `isChannelActive`
- `src/services/notificationService.svelte.ts` — `externalTargets`
- [`ADR-0018`](../../adr/0018-user-directed-egress-of-class-a-announcements.md)
- [`FEAT-0623`](../features/FEAT-0623-audit-super-alert-system-gaps-and-design.md) — the audit
  that found it
