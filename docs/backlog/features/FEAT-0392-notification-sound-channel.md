---
id: FEAT-0392
title: A sound channel for notifications
type: feature
status: specced
priority: P2
milestone: M4
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: []
size: S
estimate: 2
---

# FEAT-0392 — A sound channel for notifications

## Problem

Cachy announces on two channels: in-app and browser notification. A trader with Cachy
in a background tab and a chart in the foreground gets neither reliably. An alarm that
only exists on a screen nobody is looking at is not an alarm.

## Proposal

A fourth channel in the existing `notificationService`, beside in-app and browser.
It is a channel, not a parallel notification system — the service already owns the
policy of which channels announce what, and adding a second mechanism beside it is how
that policy stops being one thing.

- Two or three built-in tones, distinguishable from each other (a fill, an alarm, an
  error do not want the same sound).
- Volume and mute in `NotificationSettings.svelte`, next to the existing channel toggles.
- Autoplay: a browser refuses audio before the user has interacted with the page. The
  channel degrades — announces on the other channels, reports itself unavailable — and
  does not throw. The settings UI says so plainly rather than letting the trader believe
  a muted alarm is armed.

Tones ship as static assets. Nothing reaches the network.

## Acceptance criteria

- [ ] `announce()` delivers on the sound channel and reports it in the returned channel
      list, so a test can assert delivery rather than trust it
- [ ] Volume and mute persist and are honoured
- [ ] With no prior user interaction the channel reports unavailable, the other channels
      still deliver, and nothing throws
- [ ] The settings UI shows the channel as unavailable in that state rather than as on
- [ ] Muting the sound channel does not mute the others
- [ ] German and English strings

## Out of scope

- User-uploaded sounds and per-rule tone selection. File handling in the browser is its
  own item with its own traps (size, storage, autoplay).

## Links

- `src/services/notificationService.svelte.ts`, `src/components/settings/NotificationSettings.svelte`
- [`FEAT-0393`](FEAT-0393-rule-trigger-method-and-lifecycle.md) — chooses which channels a rule uses
