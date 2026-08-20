# ADR-0008: A verb the venue cannot perform is refused before it travels, and reads and writes fail differently

- **Status:** Proposed
- **Date:** 2026-08-18
- **Deciders:** mydcc

## Context

[`ADR-0007`](0007-exchange-adapter-boundary.md) gave every exchange an adapter
and had it *declare* what its venue cannot do, but deliberately left the
declaration inert: an unsupported verb still travelled and was refused at the
far end. That was a sequencing choice — acting on the declaration is a
user-visible change, which `FEAT-0016` ruled out — and ADR-0007 recorded it as
a decision still to be made.

The industry rule is the opposite one. *Pre-trade control* means a request
whose rejection is already known does not leave the client: MiFID II's RTS 6
requires it of firms doing algorithmic trading, and venues enforce it
commercially through order-to-trade and message-efficiency ratios. Beyond
either, sending a request that is certain to fail opens a window in which the
order's state is unknown to the client, and that window is what makes a trader
act on a stop that was never moved.

Cachy has three places such a request can be stopped, and only the outermost
was in use:

| Line of defence | Where | State before this ADR |
|---|---|---|
| The control is not offered | `FEAT-0017` | not built |
| The adapter refuses locally | `src/services/exchange/` | **missing** |
| The venue refuses | `routes/api/tpsl/+server.ts:58` | works |

The middle line is the one that still holds when the first is bypassed — a
panel left open across an exchange switch, a keyboard shortcut, a stale
capability read. It cannot be replaced by the first.

Against deciding this way: it *is* a behaviour change, and a local refusal can
be wrong in a way a venue's refusal cannot — if a `supports` flag says false
about something the venue can actually do, Cachy now blocks a capability the
trader has. That is the price, and it is why the flags are set from verified
wire formats only.

## Decision

**An adapter refuses a verb its `supports` declaration marks absent, before a
request is built or signed. Reads and writes fail differently:**

- **A read resolves empty.** "There is nothing here" is a true answer and
  carries no risk. `fetchTpSlOrders` on a venue without TP/SL returns `[]`;
  the position cards call it on every refresh and must not raise a dialog.
- **A write throws `ExchangeUnsupportedError`.** A write that resolved quietly
  would let a trader believe a stop had moved when nothing happened. That is
  the worst outcome available here, so silence is not an option for writes.

**One declaration, one source.** The `supports` object an adapter exposes is
the same object its guards read. A declaration that can disagree with the
behaviour it describes is worth nothing.

**The refusal is language, not a code.** `ExchangeUnsupportedError` carries an
i18n key; `getDisplayMessage` renders it the way it already renders a gate
refusal, so the trader is told which venue and which capability.

**The venue's refusal stays.** The proxy routes are unchanged and remain the
last line of defence, because a local guard is a claim about the venue and the
venue is the authority on itself.

## Consequences

### What this enables

- A trader learns immediately what their exchange cannot do, instead of
  reading a generic API error after a round trip.
- `FEAT-0017` can build the first line of defence on the same declaration.
- A new adapter inherits the rule rather than inventing one: the contract test
  classifies every verb it exposes.

### What this costs

- A wrong `supports` flag now blocks a real capability. Previously an
  over-cautious flag cost nothing at runtime; now it costs the feature. Flags
  must come from a verified wire format, never from an assumption.
- Two failure shapes exist for the same cause — an empty result and an
  exception — and a caller has to know which verb it is holding. The split is
  documented in `TradingPort` and enforced by the contract test.

### What is now forbidden

- An adapter method must not resolve with fabricated success for a verb the
  venue cannot perform. Empty is permitted for reads; a fake receipt never is.
- A write behind a false `supports` flag must not reach `tradeService`.
  Enforced by `src/services/exchange/unsupportedVerbs.test.ts`, which asserts
  the *absence* of the transport call rather than the presence of an error.
- A verb added to a port must be classified in that test's table. An
  unclassified verb fails the build rather than reaching a trader undecided.
- A `supports` flag must not be set from documentation Cachy has not verified
  against a real response. BUG-0001 is the standing reminder.

## Alternatives considered

**Leave the declaration inert and let the venue refuse.** The state before
this ADR. Rejected: it is exactly the pattern pre-trade control exists to
prevent, and it leaves the middle line of defence empty, so a UI bypass
reaches the wire.

**Throw for reads as well, for consistency.** Rejected: the position cards
poll TP/SL plans, and an exception per refresh would turn a known, harmless
gap into a stream of error dialogs. Empty is not a workaround here — it is the
correct answer to "what plans exist on this venue".

**Wait for `FEAT-0017` and gate in the UI only.** Rejected: a hidden control
is not a guarantee. The UI can be out of step with the active exchange, and
the layer that builds the request is the one that can be certain.

**Return a typed result object instead of throwing** (`{ ok: false, reason }`).
Rejected for now: every existing call site already handles thrown errors
through `getDisplayMessage`, and introducing a second error protocol for one
case would leave two conventions in the same file.
