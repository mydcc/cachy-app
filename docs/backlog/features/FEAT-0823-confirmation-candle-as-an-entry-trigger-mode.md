---
id: FEAT-0823
title: Confirmation candle as an entry trigger mode
type: feature
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: ADR-0012
depends_on: [FEAT-0807]
parent: FEAT-0805
size: S
estimate: 5
---

# FEAT-0823 — Confirmation candle as an entry trigger mode

## Problem

Many trading setups are taught as "wait for the confirmation candle": the
signal candle closes (RSI under 30, price under a level), but the entry waits
one more candle to confirm that the market actually turned. Cachy's condition
language has no home for that second step — a trader who wants confirmation
today has to approximate it with window operands, which is neither exact nor
explainable.

The product owner asked for the checkbox version (review round, 2026-11-18):
the trigger should be either the candle close or the confirmation candle after
a positive close — and the idea had to be examined before it entered the
backlog. Examination result: it is sound **as an entry-timing mode**, not as a
new condition type, and it is deterministic and replayable, so it fits
ADR-0012's "checkable data" model and the candle-close evaluation decision.

## Proposal

A trigger mode field in the bot envelope, in the same editor section as the
firing policy (FEAT-0822):

- `immediate` — default: entry at the close of the signal candle (today's
  behavior, unchanged).
- `confirmation` — the bot enters a visible **"awaiting confirmation"**
  state after the signal; at the next candle close it checks the
  confirmation rule (default: direction — a long signal needs a green
  candle, a short a red one; a custom condition is a later extension) and
  enters at that close.

If the confirmation fails, the signal **expires** with one log entry
("signal discarded: confirmation candle against direction") and the bot
returns to armed. No hidden state, no zombie signals, no double entry —
the state is derived from the rule plus the book, as FEAT-0807 demands.

Protection never waits: stops and exits (FEAT-0809/0810) are unaffected by
this mode, because safety must not hesitate.

The honest price, stated in the editor: the entry lies one candle later —
if the move runs without a pause, confirmation costs the better price.
Optional, never forced.

## Acceptance criteria

- [ ] A bot with `confirmation` fires its signal, shows
      `awaiting confirmation`, and enters exactly once at the close of a
      confirming candle.
- [ ] A counter-confirmation candle produces exactly one expiry record and
      returns the bot to armed without an entry.
- [ ] The mode is included in the content hash; documents without it keep
      their existing hash.
- [ ] The state `awaiting confirmation` is visible in the sidebar (FEAT-0808)
      and derived, not persisted.
- [ ] Stops and exits never wait for confirmation; a stop-out during the
      wait cancels the pending signal cleanly.
- [ ] Determinism: given the same candles, the same evaluation replay
      produces the same entries — no intrabar peeking.
- [ ] The editor states the trade-off (entry one candle later) in both
      locales, with i18n keys.

## Out of scope

- Custom confirmation conditions (direction first; the condition language
  can express more later once offset operands exist).
- Applying confirmation to exits — rejected by design.
- Intrabar triggers generally (TODO.md #32 tracks the cadence decision).

## Open questions

- Whether the default confirmation rule should be candle direction or
  "closes in favor of the signal side above/below the signal close".
  Proposal: direction (green/red), the simplest honest rule.

## Links

- [`ADR-0012`](../../adr/0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md)
- [`FEAT-0805`](FEAT-0805-bot-system-v2-from-conditional-orders-to-strategies.md)
- [`FEAT-0807`](FEAT-0807-derive-bot-lifecycle-state.md)
- [`FEAT-0822`](FEAT-0822-bot-firing-policy-and-guards.md) — same editor section
- [`TODO.md`](../../TODO.md#32--take-profit-and-exit-semantics)
