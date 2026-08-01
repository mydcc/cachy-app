# Vision

What Cachy is for, who it is for, and how it is meant to pay for itself. This
document changes rarely. When it does, [`MILESTONES.md`](MILESTONES.md) and
[`ROADMAP.md`](ROADMAP.md) have to be re-checked against it.

---

## What Cachy is

A trading terminal for crypto derivatives that a trader can run on their own
machine, understand completely, and trust with real money.

It started as a position-size calculator. It is now a calculator, a risk engine,
a journal, a live market feed, an indicator engine and — technically — an order
router. That last one is the reason the rest of this document is careful: the
moment software can place an order, every unclear requirement becomes a way to
lose money.

## Who it is for

Retail crypto traders who size positions deliberately rather than by feel, and
who care where their data goes. Not institutions, not market makers, not people
who want a signal service.

The design consequence: the user is assumed competent and is never protected by
hiding information from them, but is always protected from the software doing
something they did not ask for.

## The three commitments

Everything below follows from these, and they are ordered. When two conflict,
the higher one wins.

### 1. The user's data stays the user's

Journal, settings, credentials, presets, notes and trade drafts live on the
device. Not as a default that can be configured away — as an architectural
boundary with an ADR behind it ([ADR-0001](adr/0001-local-first-boundary.md),
[ADR-0004](adr/0004-spacetimedb-data-scope.md)).

This is the commitment most likely to be quietly broken by a convenient feature,
which is why it is first and why it has the most enforcement machinery.

### 2. The software does nothing with money that the user did not ask for

Every order is intended, verifiable before it is sent, and stoppable. This
applies with equal force to a manual click and to an autonomous agent — an agent
is not an exception to this commitment, it is the reason the commitment needs to
be enforced structurally rather than by careful UI.

A concrete consequence, and the reason the roadmap is ordered the way it is:
**no autonomous execution ships before the safety layer that would contain it.**
Not as a matter of taste. An agent that can place orders on top of an
unverified execution path is a way to lose money at machine speed.

### 3. It works alone

The calculator, the journal, the risk engine and the exchange connection work
with every Cachy server unreachable. A trader who is mid-position when the
project's infrastructure goes down — or when the project ends — loses nothing.
[ADR-0003](adr/0003-edition-boundary.md) makes this a property of the build
rather than a promise.

## Where it is going

Three layers, built in this order, each one useless or dangerous without the one
below it.

**A safe execution layer.** Pre-flight verification, a paper-trading mode that
is genuinely the same code path, hard risk limits, and a kill switch. This is
the foundation for everything else and it is deliberately unglamorous.

**A real trading terminal.** The order types, margin and position modes, alerts,
confirmations and multi-account handling that a trader actually needs — built
against an exchange abstraction so that supporting the next broker is a
configuration task rather than a rewrite.

**An analyst that becomes an operator.** AI that reads the market, crawls news,
forms a view, selects a strategy — and eventually executes it. This is the
long-term goal and it is last for the reason given under commitment 2.

Collaboration features (chat, copy trading) sit alongside these rather than
between them: they are optional modules, they never gate the core, and each one
needs its data boundary decided before it is built rather than after.

## How it pays for itself

Development and servers cost money, and AI costs money per query. The honest
version of the business model, including the part that constrains it:

**The core is free and complete.** The calculator, risk engine, journal and
exchange connections are the product's substance and they are not the thing
being sold. Selling a crippled calculator would contradict commitment 3 —
someone must be able to self-host the real thing.

**What can be sold** is what genuinely costs money to provide, or what only
makes sense hosted:

- **Whitelabel/Community licences** — the serverless build, rebranded, sold to
  someone who wants to run it for their own audience.
- **Hosted server-backed modules** — collaboration, cross-device sync of Class B
  data, hosted AI inference. These have a marginal cost per user, which is what
  makes charging for them defensible.
- **Plugins** — paid extensions that add capability rather than un-removing it.

**What cannot be sold**, as a rule and not a preference: capability removed from
the core in order to sell it back. If a feature belongs in the core by the
definition in ADR-0003, it ships in Community.

**Self-hosting is always the alternative.** Anyone can run the full thing on
their own infrastructure and pay nothing. That is not a leak in the business
model, it is what makes the privacy claim credible.

## What Cachy is not

- **Not a signal service.** It does not tell users what to trade in exchange for
  a subscription.
- **Not a broker or a custodian.** It never holds funds. Credentials are the
  user's and stay on the device.
- **Not a backtesting platform.** Historical strategy research is a different
  product; Cachy operates on live and near-live state.
- **Not a game.** The 3D background and the SpacetimeDB substrate make a
  gamified version technically easy and it is explicitly out of scope for this
  product — trading is where users lose real money and the interface should not
  suggest otherwise. If it happens, it happens as a separate fork with a
  separate name, not as a feature here.

## Non-negotiables for anyone building on this

Restated from `CLAUDE.md` because they are consequences of the commitments
above, not house style:

- `decimal.js` for every price, amount and balance. Native `number` for a
  financial value is a rounding error waiting to become a loss.
- Verification over assertion. A change is done when a test proves it, not when
  it compiles.
- No deletion of code whose purpose is unclear.
- Class A data never leaves the device.
