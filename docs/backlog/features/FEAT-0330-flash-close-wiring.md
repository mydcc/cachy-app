---
id: FEAT-0330
title: Wire flash close to the positions list
type: feature
status: in-progress
assignee: claude
priority: P1
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: A
adr: none
depends_on: [FEAT-0024]
estimate: 2
size: S
target_date: 2026-12-17
start_date: 2026-09-01
---

Branch: `feat/feat-0330-flash-close-wiring`

# FEAT-0330 — Wire flash close to the positions list

## Problem

`tradeService.flashClosePosition` has existed and been tested for months, and
nothing calls it. The one control that gets a trader out of a position in a
single click is service-complete and absent from the UI.

Split out of [`FEAT-0023`](FEAT-0023-position-management.md), which listed it as
one of five position controls and blocked it on a confirmation policy. That
policy is [`FEAT-0024`](FEAT-0024-confirmation-policy.md), now shipped: flash
close is its first consumer and the action its default protects.

## Proposal

Two buttons, both additive — no existing control changes behaviour.

- **Detailed mode:** a fourth button in the footer row, next to Close.
- **Focus/panic mode:** a second button beside the X. The X keeps opening
  `ClosePositionModal` (partial close, FEAT-0256); flash close is the separate,
  faster, more dangerous thing and should look like it.

Pressing it raises `ConfirmActionModal` with the numbers that matter — symbol,
side, size, mark price and the unrealised PnL the close would book — and the
dialog's confirmation timestamp travels into the order intent as `confirmedAt`.

Without that timestamp the gate refuses, so the wiring cannot be half-done: a
button that forgets to confirm does not send a market order, it gets a refusal.

## Acceptance criteria

- [x] Flash close reachable from both position view modes
- [x] The dialog states symbol, side, size, mark price and unrealised PnL —
      concrete numbers, not "are you sure?"
- [x] Confirming passes `confirmedAt` through to the gate
- [x] Cancelling sends nothing
- [x] With the confirmation switched off in settings, one click closes — and
      the FEAT-0011 verification still runs
- [x] German and English strings

## Out of scope

- The other four FEAT-0023 controls. Trailing stops remain blocked on a
  verified Bitunix endpoint; add-to/reduce still needs its own item.
- Raising the dialog for the eight other confirmable actions. They fail closed
  at the gate already; their call sites attach to `ConfirmActionModal` when
  their own feature touches them.

## Links

- [`FEAT-0023`](FEAT-0023-position-management.md) — the epic this belongs to
- [`FEAT-0024`](FEAT-0024-confirmation-policy.md) — the policy and the dialog
- [`FEAT-0011`](FEAT-0011-preflight-order-verification.md) — the verification
  that runs regardless

## State

Wired and verified. Two findings came out of the work and are worth recording.

**A refused flash close used to strip the position's protection.** The function
cancels the position's stop-loss and take-profit before closing — correct when
the close then happens, dangerous when it does not. Any refusal further down
(the confirmation, but equally the kill switch, a risk limit or a price
mismatch) left the trader holding an open position with its stops removed,
which is strictly worse than the state they started in. This item shipped a point fix — the
confirmation checked before that cancel runs — and
[`BUG-0331`](../bugs/BUG-0331-flash-close-strips-protection-before-refusal.md)
superseded it by verifying the whole intent early, which covers every refusal
the gate can issue rather than only this one.
`flash-close.confirmation.test.ts` asserts that a refusal sends nothing at all.

**The policy check now takes an action name, not an intent.** It had taken the
whole `OrderIntent`, which meant a caller could not ask the question before
building one. That mattered while this item carried a point fix asking about
the confirmation alone; [`BUG-0331`](../bugs/BUG-0331-flash-close-strips-protection-before-refusal.md)
superseded it by verifying the whole intent early, so the narrower
`requiresConfirmation` helper was removed rather than left standing as a second,
weaker way to ask the same question. The signature change stayed: it is what
lets the check answer without an intent, and the gate and the settings screen
resolve the same action name through the same catalogue.

`flashClosePosition` reaches the UI through `TradingPort`, not directly:
FEAT-0016's `exchange_boundary.test.ts` fails the build on a component that
imports `tradeService`, and it was right to.
