# ADR-0020: The Automation Envelope — Promotion Derives a Bot, and Simulate Bots Submit Through the Gate

- **Status:** Proposed
- **Date:** 2026-09-23
- **Deciders:** mydcc

## Context

[`ADR-0012`](0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md)
settled that a strategy is a versioned `RuleDocument` evaluated on closed
candles, and that the same document serves an alert, a backtest and — one
day — an agent. 1.6.0 built the middle of that ladder: the Super-Alert panel
arms `notify` rules and the Automation tab (Settings → Automation,
`src/components/settings/tabs/AutomationTab.svelte`) arms `simulate` bots,
both evaluated by the same rule evaluator
(`technicals-wasm/src/rule/`, exposed to JS per FEAT-0387, evaluated on
candle close).

Two questions had no written answer: how does an alert *become* a bot
without corrupting its own history, and how does a bot's order reach the
paper account without opening the second execution path ADR-0012 decision 5
forbids. [`FEAT-0396`](../backlog/features/FEAT-0396-automation-settings-tab.md)
answered both in code; this ADR records the answers as rules. Live sending
(`send`) is explicitly not covered here — it belongs to
[`FEAT-0035`](../backlog/features/FEAT-0035-autonomous-execution-agent.md),
which stays `idea` until M1 and M8 are done and which requires its own ADR
before implementation.

## Decision

**1. Promotion derives a new document; it never mutates the alert in place.**

Raising `consequence_level` changes the content hash, and the hash *is* the
strategy's identity — it is what a journal entry or a decision log records.
An in-place promotion would leave every past announcement of that alert
pointing at an identity the document no longer has. Promotion therefore
writes a new document with a new `id` (`RuleDocument::promote`,
`promoteAlertToBot`); the source alert is left exactly as it was — still
armed, still announcing — unless the trader disables it themselves. The
workflow this exists for is "test it as an alarm, then let it act while the
alarm keeps watching": one document cannot be at two consequence levels.

**2. The derivation is recorded in `provenance`, and it is free.**

The link is stored as the source's **content hash** in
`Provenance.derived_from_hash`
(`technicals-wasm/src/rule/document.rs`), not its `id`: `id` is local
identity a re-import can reassign, while the hash is the identity the
journal already uses. `provenance` is listed in `EXCLUDED_FROM_HASH`, so
recording the derivation changes neither the bot's own hash nor any hash
already recorded — pinned by the content-hash tests. `Provenance` carries
`#[serde(deny_unknown_fields)]`, so the field is declared in Rust with
`#[serde(default, skip_serializing_if = "Option::is_none")]` and documents
written before it existed still parse.

**3. A bot submits only through the gate, on the human click's route.**

`src/services/alertEngine/botOrders.ts` turns one firing into one
`EntryPlan` and hands it to
`orderPlacementService.placeEntryGroup` — the same function the
calculator's Place Order panel calls. From there the route is identical:
`tradeService.placeOrder` → `gatedRequest` → `OrderGate`. FEAT-0013's risk
limits are therefore not re-applied to bot orders; they sit inside the gate
and a bot's order passes through it. Re-implementing them would be the
second path ADR-0012 decision 5 forbids, and the reason it forbids it is
that the copy drifts. The sink is a **decorator**, not a replacement:
`withBotOrders` forwards every firing to whichever sink the caller already
chose and only then looks at whether this one submits — announcing and
acting are two consequences of one event.

**4. The level is gated by the ladder, not by validation.**

`RuleAction::validate`
(`technicals-wasm/src/rule/consequence.rs`) accepts `send` as long as an
order intent is present; what it refuses is contradiction. The level is
gated by `RuleDocument::authorise(requested)`: the Automation tab writes
`simulate` only, and `authorise(Send)` on a `simulate` document refuses —
pinned by a core test. Should a `send` rule fire anyway, it is refused with
`level-not-supported` through the normal refusal channel (BUG-0487) — never
silently dropped, never submitted. Gating on `provenance` (which surface
wrote this) would be gating a money-path decision on an unhashed field;
two documents with the same content hash would authorise differently.

**5. A bot that cannot submit says so.**

A bot submits only when the trader armed it **and** paper trading is on.
When it cannot, it announces once per rule and reason, in both locales —
a bot that sits armed and silently does nothing looks like a strategy that
found no setup, which is worse than an alert that does not fire.

**6. An order without a stop is not a bot order.**

`OrderIntent.stop` is a `StopDistance` — a distance resolved against the
entry the gate is about to submit, tagged by `basis`, never a stale price
written into the document. It is what makes `size_basis: percent_risk`
computable (the share of equity risked between entry and stop) and what
criterion "existing risk limits apply" has to bound. The field lives inside
`action`, which *is* hashed, but `skip_serializing_if` keeps it absent from
the serialised JSON of older documents — measured by
`stopDistance.integration.test.ts`, which pins the pre-field hashes.

## Consequences

### What this enables

- Alert → bot promotion without rewriting the strategy and without the two
  versions drifting — one condition language, one evaluator, one hash
  identity per consequence level.
- Simulated bots on the paper account that prove the live route, because
  they *are* the live route down to the transport call site.

### What this costs

- Promotion duplicates the document: two armed documents to manage where
  the trader may have expected one upgraded in place.
- Every bot firing pays the full gate (verification, risk limits,
  confirmations) — no fast path for unattended orders.

### What is now forbidden

- Mutating `consequence_level` in place on an armed rule.
- A bot order path that bypasses `OrderGate`, including one "only for
  `simulate`".
- Gating submission on `provenance` or any other unhashed field.
- Calling notification credentials "encrypted" (see
  [`ADR-0018`](0018-user-directed-egress-of-class-a-announcements.md)) —
  restated here because bot failures announce through the same channels.

## Alternatives considered

- **Bypass the gate for `simulate`.** Rejected: a bypass built for paper
  orders still exists when FEAT-0035 arrives, and it is the second path
  ADR-0012 decision 5 forbids.
- **Refuse `send` in `validate()` outright.** Rejected: that breaks
  FEAT-0035, which needs the level legal.
- **A stop price stored in the document.** Rejected: a level written at
  arm time is true only for that bar and the rule fires later; a distance
  resolved at submission stays true.
