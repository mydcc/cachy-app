---
id: FEAT-0024
title: Let the user decide which actions need confirming
type: feature
status: specced
priority: P1
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: A
adr: none
depends_on: [FEAT-0011]
---

# FEAT-0024 — Let the user decide which actions need confirming

## Problem

As the trade panel grows, so does the number of one-click actions that move
money. A fixed policy is wrong for everyone: confirming every action makes
scalping unusable, confirming none makes flash close a hazard.

## Proposal

A per-action confirmation policy the user configures once: which actions
confirm, which are one-click. Covers order placement, flash close, trailing
stop, trailing TP/SL, trigger orders, position modification, leverage and margin
mode changes, and account switching.

**A confirmation is not verification.** [`FEAT-0011`](FEAT-0011-preflight-order-verification.md)
always runs and cannot be configured away; this decides only whether a human is
asked as well. Keeping that distinction visible in the settings copy matters —
a user who thinks they disabled safety checks will behave differently from one
who knows they disabled a prompt.

Defaults are conservative: destructive and irreversible actions confirm out of
the box.

## Acceptance criteria

- [ ] Each action's confirmation can be toggled independently
- [ ] Defaults are on for flash close, leverage change, margin-mode change and
      account switch
- [ ] Disabling a confirmation never disables verification, asserted by a test
- [ ] The confirmation states what will happen with concrete numbers, not
      "are you sure?"
- [ ] Policy is Class A and stays local
- [ ] German and English strings

## Links

- Reference screenshots: Bitunix "Confirmation" settings section
- [`FEAT-0011`](FEAT-0011-preflight-order-verification.md)
