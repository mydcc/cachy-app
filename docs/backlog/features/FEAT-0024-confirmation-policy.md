---
id: FEAT-0024
title: Let the user decide which actions need confirming
type: feature
status: in-progress
assignee: claude
priority: P1
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: A
adr: none
depends_on: [FEAT-0011]
estimate: 5
size: L
target_date: 2026-12-17
start_date: 2026-08-01
---


Branch: `feat/feat-0024-confirmation-policy`

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

- [x] Each action's confirmation can be toggled independently
- [x] Defaults are on for flash close, leverage change, margin-mode change and
      account switch
- [x] Disabling a confirmation never disables verification, asserted by a test
- [x] The confirmation states what will happen with concrete numbers, not
      "are you sure?"
- [x] Policy is Class A and stays local
- [x] German and English strings

## State

Enforcement is structural, not advisory. `lib/confirmationPolicy.ts` holds the
catalogue and the defaults, `stores/confirmationPolicy.svelte.ts` the user's
choices (Class A, `localStorage` only), and `rmsService.installGateHooks`
registers the policy at the order gate through the same seam FEAT-0013's risk
limits and kill switch use. The gate refuses any action the policy requires a
confirmation for unless the intent carries `confirmedAt`, so a call site that
forgets to ask is refused rather than quietly allowed through.

The check runs last in `verify`, which is what makes "a confirmation is not a
verification" a property of the code rather than a claim in the settings copy:
every FEAT-0011 comparison has already happened before the policy is consulted.
`orderGate.confirmation.test.ts` asserts it directly.

`OrderIntent.confirmAs` carries the user's intent past a venue difference: a
flash close reaches Bitunix as `flash-close-position` and other venues as a
reduce-only `place-order`, and reading the policy off the wire would have
applied the prompt on one venue and not the other.

Two corrections to the original spec text: `PositionsList.svelte` no longer
calls a bare `confirm()` (FEAT-0256 replaced it with `ClosePositionModal`), and
trailing stop / trailing TP-SL do not exist in the code yet, so no policy keys
were created for them.

Wired so far: `flashClosePosition` (both venue paths). The remaining eight
actions are covered by the catalogue and fail closed at the gate, but their
call sites do not raise the dialog yet — `components/shared/ConfirmActionModal.svelte`
is the kit they attach to. FEAT-0023 / #1787 is the first consumer.

## Links

- Reference screenshots: Bitunix "Confirmation" settings section
- [`FEAT-0011`](FEAT-0011-preflight-order-verification.md)
