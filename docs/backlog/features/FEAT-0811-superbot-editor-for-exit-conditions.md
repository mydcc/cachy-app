---
id: FEAT-0811
title: Add exit conditions to the bot editor
type: feature
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: [FEAT-0809]
parent: FEAT-0805
size: M
estimate: 5
---

# FEAT-0811 — Add exit conditions to the bot editor

## Problem

`BotIntentEditor` edits side, size basis, size and the stop distance. Once
FEAT-0809 adds `exits` and `take_profit`, a trader has no way to author them:
the document would be readable but not writable from the app, which is the
state `veto` has been in.

## Proposal

Extend the bot editor with an **Exit** section built from the same condition
components as the entry:

- One row per exit: condition sentence, `close all` / `close partial` and the
  fraction, remove.
- A take-profit control (distance from entry, mirroring the stop) if FEAT-0809
  ships the field; otherwise an exit condition on the profit percentage.
- Side-aware wording: a long's exit says "close when RSI is above 70"; a short's
  says "close when RSI is below 30". The condition itself is not rewritten —
  only the labels and the example text follow the position side.
- Refusals from the core are anchored to the row and field that caused them, the
  way `BotIntentEditor` already anchors size and stop refusals.
- A read-back sentence for the whole exit set, in both locales.
- The section is hidden/disabled for `notify` documents, which cannot hold
  exits.

## Acceptance criteria

- [ ] A bot can be authored with zero, one or more exit rules; the document
      round-trips through save and reload.
- [ ] A partial exit requires a fraction; the field is validated before save and
      the core refusal is anchored to it.
- [ ] The side-aware labels differ for long and short and are covered by a
      component test in both locales.
- [ ] Every control is keyboard reachable and labelled; the exit list has a
      readable sentence.
- [ ] Removing the last exit leaves a valid document with no `exits` key (not an
      empty array).
- [ ] A `notify` rule cannot be given an exit from this editor.

## Out of scope

- Executing the exits (FEAT-0810).
- A visual strategy builder or chart-drawn exits.
- Trailing/break-even presets; they are conditions, not separate controls.
- Migrating existing bots; they simply have no exits until edited.

## Open questions

- Whether the exit editor lives in the control center's Bots tab or in the
  Super-Alert panel; proposal: control center, next to the bot it belongs to.
- Whether the take-profit control is a distance or a condition row; depends on
  [`TODO.md`](../../TODO.md#32-take-profit-and-exit-semantics).

## Links

- [`FEAT-0809`](FEAT-0809-rule-exit-conditions-in-the-strategy-document.md)
- [`FEAT-0810`](FEAT-0810-execute-bot-exits-through-the-order-gate.md)
- Code: `src/components/alerts/bots/BotIntentEditor.svelte`,
  `src/components/alerts/tabs/*`
