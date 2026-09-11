---
id: FEAT-0392
title: A sound channel for notifications
type: feature
status: done
assignee: mydcc
branch: worktree-feat-0392-0397-a48a54
resolved_at: 2026-09-11
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

A third channel in the existing `notificationService`, beside in-app and browser.
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

- [x] `announce()` delivers on the sound channel and reports it in the returned channel
      list, so a test can assert delivery rather than trust it
- [x] Volume and mute persist and are honoured
- [x] With no prior user interaction the channel reports unavailable, the other channels
      still deliver, and nothing throws
- [x] The settings UI shows the channel as unavailable in that state rather than as on
- [x] Muting the sound channel does not mute the others
- [x] German and English strings

## How it was built (2026-09-11)

One deliberate departure from the proposal above: the tones are **synthesised
with WebAudio**, not shipped as static assets. Two reasons, both about a tone
proving itself — a committed audio file is a build artefact that drifts from the
code that plays it and a silent file looks exactly like a working one (the
`static/wasm` failure mode, one subsystem over), and a file has to be fetched and
decoded, which is a request and a failure path an oscillator does not have.
"Nothing reaches the network" holds more strictly this way. What survives from
the item's intent is the important half: the tones are built in, distinguishable,
and come from nowhere but the device.

The three tones differ on pitch direction, rhythm *and* timbre rather than pitch
alone, because a laptop speaker flattens timbre and a trader identifies an alarm
by its rhythm before its frequency. `alert-fired` gets the alarm tone alone;
fills and cancellations share the neutral chime, and a rejection gets the falling
one.

Availability is read from the live `AudioContext.state`, which makes "the browser
has not allowed audio yet" a readable state rather than a guess — and `locked` is
kept separate from `unsupported` for the same reason `permission()` does not fold
`unsupported` into `denied`: one resolves on the next click, the other never
will.

Note on what this closed: [`FEAT-0393`](FEAT-0393-rule-trigger-method-and-lifecycle.md)
had already shipped `"sound"` in `TriggerMethod`, so a trader could tick "Sound"
on a rule and hear nothing. That gap is now closed at the channel level. Per-rule
`trigger_methods` is still not honoured by the firing sink at all — see
[`FEAT-0397`](FEAT-0397-notification-channels.md)'s note and ADR-0018.

## Out of scope

- User-uploaded sounds and per-rule tone selection. File handling in the browser is its
  own item with its own traps (size, storage, autoplay).

## Links

- `src/services/notificationService.svelte.ts`, `src/components/settings/NotificationSettings.svelte`
- [`FEAT-0393`](FEAT-0393-rule-trigger-method-and-lifecycle.md) — chooses which channels a rule uses
