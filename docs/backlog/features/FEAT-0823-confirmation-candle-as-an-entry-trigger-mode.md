---
id: FEAT-0823
title: Confirmation candle as an entry trigger mode
type: feature
status: done
priority: P3
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: ADR-0012
depends_on: [FEAT-0807]
assignee: opencode
branch: feature/feat-0823-confirmation-candle-entry-mode
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

- [x] A bot with `confirmation` fires its signal, shows
      `awaiting confirmation`, and enters exactly once at the close of a
      confirming candle.
      *Loop tests (9 cases: hold, green entry, red discard, doji-against,
      stop-out cancel, reload catch-up, quiet catch-up, edited-mode purge,
      genuine replay) — the unit tests pin the entry ANCHOR (the
      confirmation close, `anchorMs` asserted) — and the money-path e2e
      pins the lane, the ledger and the network (the entry lands through
      the same lane every entry takes, counted once, no network; the feed
      price is constant there, so the anchor claim is the unit side's).*
- [x] A counter-confirmation candle produces exactly one expiry record and
      returns the bot to armed without an entry.
      *The discard lands in the guard ledger (`confirmation-against-direction`)
      via the same channel every other refusal records through (0822), and
      the bot re-arms — conditions still holding form the next wait. Pinned
      in the e2e's counter-candle case and the loop's red/doji cases.*
- [x] The mode is included in the content hash; documents without it keep
      their existing hash.
      *Rust identity tests + entryTrigger.integration against the rebuilt
      artifact: the pre-field constants hold across the fourth schema
      crossing; absent == immediate.*
- [x] The state `awaiting confirmation` is visible in the sidebar (FEAT-0808)
      and derived, not persisted.
      *`BotState.awaiting_confirmation` + `BotBook.awaiting` fed from the
      loop's per-close report; the chip and rank pinned in BotsList's
      component tests; nothing persists the wait — a reload re-derives it
      at the next close (the catch-up's contract, pinned).*
- [x] Stops and exits never wait for confirmation; a stop-out during the
      wait cancels the pending signal cleanly.
      *The exit window is untouched (0810's own pass); the stop-out cancel
      is its own discard reason (`signal-stopped-out`) with a loop test and
      a guard-locale key, and the cancel wins over the direction check.*
- [x] Determinism: given the same candles, the same evaluation replay
      produces the same entries — no intrabar peeking.
      *The decided-anchor floor is the replay guard, review-hardened: an
      anchor this loop already decided (in-session map) or already entered
      on (the fire ledger's last anchor, durable across reloads) is never
      decided twice — pinned by the genuine-replay test (market-cache
      eviction: forget the series, refill it, no re-entry). The document
      refuses `confirmation + intrabar` outright
      (`confirmationNeedsCloses`, both locales), so the wait can never
      read a forming candle.*
- [ ] The editor states the trade-off (entry one candle later) in both
      locales, with i18n keys.
      *Deferred to FEAT-0811, the same deferral 0822's editor criterion
      carries: the editor section is 0811's deliverable, and shipping its
      locale keys now would be dead strings no surface renders. The
      document field, its validation and its sidebar rendering are this
      item's; the control that sets them is the editor's.*

## Out of scope

- Custom confirmation conditions (direction first; the condition language
  can express more later once offset operands exist).
- Applying confirmation to exits — rejected by design.
- Intrabar triggers generally (TODO.md #32 tracks the cadence decision).

## Decided questions

- **2026-11-19 (shipped with this item):** The confirmation rule is candle
  **direction** (green for a long, red for a short, doji against) — the
  simplest honest rule, as proposed. A "closes beyond the signal close"
  variant stays expressible later once offset operands exist; direction
  ships now because it is the version every textbook phrase names.

## Open questions

- Whether the default confirmation rule should be candle direction or
  "closes in favor of the signal side above/below the signal close".
  ~~Proposal: direction (green/red), the simplest honest rule.~~ Decided
  above: direction ships.

## Links

- [`ADR-0012`](../../adr/0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md)
- [`FEAT-0805`](FEAT-0805-bot-system-v2-from-conditional-orders-to-strategies.md)
- [`FEAT-0807`](FEAT-0807-derive-bot-lifecycle-state.md)
- [`FEAT-0822`](FEAT-0822-bot-firing-policy-and-guards.md) — same editor section
- [`TODO.md`](../../TODO.md#32--take-profit-and-exit-semantics)
