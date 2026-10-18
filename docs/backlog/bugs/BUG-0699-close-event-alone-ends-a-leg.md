---
id: BUG-0699
title: A CLOSE frame alone ends a TP/SL leg the venue says is not final
type: bug
status: done
priority: P2
milestone: none
created: "2026-10-18"
editions: [community, pro, private]
area: execution
data_class: none
adr: none
depends_on: []
assignee: claude
---

# BUG-0699 — A CLOSE frame alone ends a TP/SL leg

Found while reviewing #4137 (BUG-0697). Not introduced by it: the `event`
short-circuit stood in that line before, and BUG-0697 rewrote the expression
next to it without settling it.

## Symptom

The venue can send `event: "CLOSE"` together with a status that is not final.
Cachy treats the event alone as terminal and removes both legs of the row. The
position card then shows no stop, `restingStopPrice()` returns `null`, and an
`add` under a configured `maxLossPerTrade` is refused as `unmeasurable` — while
the venue still holds the stop.

The existing unit test pins this behaviour rather than questioning it
(`src/stores/tpsl.test.ts`, "removes a leg on event CLOSE", which pushes
`{event: "CLOSE", tpPrice: "93"}` with no status at all).

## Evidence

**Derived.** Two pieces of the repository disagree, and the vendor is explicit:

- `src/stores/tpsl.svelte.ts:313`, in `updateFromWs` — the first arm of the
  terminality test, unchanged by BUG-0697:

  ```ts
  const closed =
      data.event === "CLOSE" ||
      (status !== undefined && status !== "" && status !== "NEW");
  ```

  On this arm `status` is never consulted, so `{event: "CLOSE", status: "NEW"}`
  removes both legs.

- `docs/bitunix-api/08_websocket.md:404-405` — the vendor's statement, quoted in
  this mirror under *The `CLOSE` event is not a final state*:

  > Read `event` together with `status`, always. A `CLOSE` on its own is not a
  > final state.

Not observed on a live push, and read carefully: the mirror says a `CLOSE` on
its own is not final. It does **not** say a `CLOSE` frame ever arrives without a
terminal status. Whether the venue sends the combination at all is unconfirmed,
which is why this is P2 and not P1.

## Cause

The arm was written from the same vendor post as the pair BUG-0697 removed, and
treated `event` as a self-sufficient terminal signal. The mirror's later
correction note names both fields as a pair; only the status half was brought
over.

## Fix

Decide the semantics, then make one of them true:

- **Preferred:** gate the event arm on the status as well, so a `CLOSE` only
  ends the row when the status is terminal. This needs the three existing tests
  that pin the old behaviour updated together with it — they assert a
  price-carrying `CLOSE` with no status removes the leg.
- Or keep the arm and record why, naming `08_websocket.md:404` in the comment so
  the next reader sees it was a choice rather than an oversight.

Leave the status arm alone: BUG-0697 settled it, and it is pinned by eight
tests.

## Acceptance criteria

- [x] The chosen semantics is written down, with `08_websocket.md:404` named —
      the block comment in `tpsl.svelte.ts` names the line and states the
      reasoning, and `## State` below records why the alternative was rejected
- [x] A test pushes `{event: "CLOSE", status: "NEW"}` and asserts the outcome
      the decision requires — both legs go
- [x] The three existing `CLOSE` tests still pass — and the measurement is what
      settled the decision: with the event arm removed, exactly three tests go
      red (`removes a leg on event CLOSE`; `forgets the row when the plan
      closes, so a later leg inherits nothing`; the new pin)
- [x] `restingStopPrice()` agrees with the store — both legs leaving the store
      is what BUG-0697's `restingStopPrice` test already asserts for a row
      terminal frame

## Out of scope

- The status enum itself. BUG-0697 owns that.
- `FILLED` semantics for the remaining leg of a bracket.

## Links

- [BUG-0697](BUG-0697-a-venue-cancelled-leg-stays-resting.md) — the terminality
  test this arm sits in
- [BUG-0661](BUG-0661-tpsl-post-drag-refetch-swallowed.md) — the superseded-response
  guard this arm sits beside; the same failure shape, a display that contradicts
  the venue
- [`docs/bitunix-api/08_websocket.md`](../../bitunix-api/08_websocket.md) —
  §*The `CLOSE` event is not a final state*

## State

Done 2026-10-18 on branch `fix/bug-0697-venue-cancelled-leg-stays-resting`,
together with BUG-0697 — the two touch one expression, so splitting them would
have meant two PRs editing the same line.

**The decision: keep the arm.** Dropping it — the fix this item preferred — was
measured rather than assumed. With the event short-circuit removed, three tests
go red: `removes a leg on event CLOSE`, the BUG-0665 test `forgets the row when
the plan closes, so a later leg inherits nothing`, and the new pin. Two of those
predate this item, so the arm is not an oversight that drifted but a choice that
is twice pinned.

Two reasons the choice stands. The vendor sentence is about reading the event
*on its own* — a `CLOSE` that arrives with a status is not that case, and this
channel's statuses are terminal in practice. And the direction is the cheap one:
a leg wrongly removed refuses an `add` for at most `MAX_AGE_MS` and the next
fetch restores it, while a leg wrongly kept is a phantom stop the risk engine
measures against — the direction BUG-0697 exists to close.

What changed here is that the decision is now visible in two places instead of
none: the block comment names `08_websocket.md:404` and states the reasoning, and
a test pushes `{event: "CLOSE", status: "NEW"}` and asserts both legs go. If the
other semantics is ever wanted, that test is the one to flip.

Not verified against a live push: an `event`-frame carrying a non-terminal
status has no observed instance, which is why this was P2.
