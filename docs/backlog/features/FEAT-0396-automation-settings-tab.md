---
id: FEAT-0396
title: An Automation settings tab for user-configured bots
type: feature
status: done
assignee: claude-code
branch: feat/feat-0396-p5-bot-submits
priority: P2
milestone: M9
editions: [community, pro, private]
area: alerts
data_class: A
adr: ADR-0012
depends_on: [FEAT-0387, FEAT-0389]
size: M
estimate: 8
---

# FEAT-0396 — An Automation settings tab for user-configured bots

## Problem

The rule engine can already express "when this holds, place that order":
`consequence_level: simulate` and `send` exist, `OrderIntent` exists, and
`authorise()` gates them. There is nowhere to configure one. A trader who wants a
strategy to act rather than announce has no surface for it.

## Proposal

A new **Automation** tab in `src/components/settings/tabs/`, alongside `trading`,
`chart`, `ai` and the rest (the tab id goes in `settingsTab`, `src/stores/ui.svelte.ts`).

The tab lists bots. **A bot is a `RuleDocument` with `consequence_level: simulate`** —
the same document type the alert panel arms, at a higher rung of the same ladder. Each
bot has its own document, so a trader can run several with different symbols and
different risk.

The separation the user asked for is a separation of *surface*, not of *system*: the
alert panel shows `notify` rules, this tab shows `simulate` rules, and both are
evaluated by the same evaluator against the same conditions. That is what lets a
strategy be tested as an alarm and then promoted, without being rewritten and without
the two versions drifting.

**This item stops at `simulate`.** A bot here proposes an order into paper trading and
nothing reaches an exchange. Live sending is `FEAT-0035`, which brings the order gate,
the risk limits and the confirmation path with it — and that is a different
conversation about a different kind of mistake.

Reuses `PaperTradingSettings.svelte` for the simulated account and
`RiskLimitsSettings.svelte` for the bounds; neither needs a parallel version.

## Decisions (2026-09-17)

**Promotion derives a new document; it never mutates the alert in place.**
Raising `consequence_level` changes the content hash, and the hash *is* the strategy's
identity — it is what a journal entry or a decision log records. An in-place promotion
would leave every past announcement of that alert pointing at an identity the document
no longer has, and the surviving history would read as if the bot had been proposing
orders all along. Compare `enabled`, which is deliberately unhashed because arming is
not a change of strategy: raising the consequence level *is* one, and the hash already
says so. Promotion therefore writes a new document with a new `id`, and the source
alert is left exactly as it was — still armed, still announcing, unless the trader
disables it themselves.

**The derivation is recorded in `provenance`, and it is free.**
`"provenance"` is listed in `EXCLUDED_FROM_HASH`
(`technicals-wasm/src/rule/document.rs`), so a new field there changes neither the
bot's own hash nor any hash already recorded. The link is stored as the source's
**content hash**, not its `id`: `id` is local identity that a re-import can reassign,
while the hash is the identity the journal already uses, so "this bot descends from
that strategy" stays answerable across devices and exports.

**Consequence: a `Provenance` schema addition, not a free-text note.**
`Provenance` carries `#[serde(deny_unknown_fields)]`, so the new field has to be
declared in Rust and marked `#[serde(default, skip_serializing_if = "Option::is_none")]`
for every document written before it existed to keep parsing. As with any change to
`technicals-wasm/`, the committed `static/wasm/` artefacts must be rebuilt in the same
PR — they do not fail loudly when they lag the Rust source.

**Keeping both running is the point, not a side effect.**
The workflow this tab exists for is "test it as an alarm, then let it act while the
alarm keeps watching". Mutation would destroy exactly that: one document cannot be at
two consequence levels, so promoting in place silently ends the alert the trader was
still relying on.

## Correction (2026-09-18) — where the `send` refusal actually lives

The third acceptance criterion used to say that a `send` document is "refused by
`validate()`". Checked against the core: it is not, and it should not be.

- `RuleAction::validate` (`technicals-wasm/src/rule/consequence.rs`) accepts `send`
  as long as an order intent is present. What it refuses is contradiction — `notify`
  carrying an order, `simulate`/`send` carrying none, a non-positive size, a percent
  size above the whole account. Nothing about the level itself.
- The level is gated by the **ladder** instead: `RuleDocument::authorise(requested)`
  delegates to `ConsequenceLevel::authorise`, so a rule authored at `simulate` refuses
  a caller asking it to send. That is the FEAT-0303 gate, and it already holds.

There are two ways to make the old wording literally true, and both are wrong:

1. Refuse `send` in `validate()` outright. That breaks
   [`FEAT-0035`](FEAT-0035-autonomous-execution-agent.md), which needs the level legal
   — and it would refuse documents this item never had any business refusing.
2. Refuse it only for documents authored in this tab. The one field that could carry
   "which surface wrote this" is `provenance`, and `provenance` is **excluded from the
   hash**. Gating a money-path decision on an unhashed field would let two documents
   with the same content hash authorise differently, which is exactly the property the
   hash exists to deny. It would also contradict the decision directly above, which
   leans on provenance being free precisely *because* nothing depends on it.

So the criterion now names the mechanism that already holds rather than inventing one:
the tab writes `simulate`, and a core test pins that `authorise(Send)` on a `simulate`
document refuses. A bot document that somehow carried `send` would still submit
nothing — there is no `send` path until `FEAT-0035` builds one, order gate, risk limits
and confirmation included.

## State (2026-09-18) — what is built, and the one thing that is not

Three PRs have landed or are open. Ten of the twelve criteria are covered.

| PR | What |
|---|---|
| #3452 (merged) | `Provenance.derived_from_hash`, its shape validator and `InvalidDerivedFromHash` |
| #3453 (merged) | `RuleDocument::promote` and `promoteAlertToBot` — criteria 4, 5, 6, and 3's core half |
| #3454 (open) | The Automation tab, `botStore.ts`, the sentence fix — criteria 1, 2, 3, 9, 10, 12 |

**Criteria 7 and 8 are blocked on a decision, not on work.** "A fired bot
produces a simulated order in the paper account" and "existing risk limits apply
to simulated orders" both require a bot's order to reach
`paperExchange` — and the only route there that ADR-0012 decision 5 permits is
the one a human click takes, through `OrderGate`.

The gate cannot currently be asked by a bot:

- `OrderIntent.displayed: DisplayedState` is **required**, and it is documented
  as "the state the UI displayed at the moment of confirmation". A bot has no
  screen, so there is no displayed state to capture and nothing to compare a
  payload against.
- `OrderIntent.confirmedAt` is optional, but its absence is documented as never
  benign: for any action the policy requires confirmation for, the gate refuses.
  A bot has no human to confirm.

There are two ways to make a bot order pass, and both need a human decision:

1. **Bypass the gate for `simulate`.** This is the one thing the item's own
   `## Correction (2026-09-18)` section leans on ADR-0012 decision 5 to forbid,
   and a bypass built for paper orders is a bypass that exists when
   [`FEAT-0035`](FEAT-0035-autonomous-execution-agent.md) arrives.
2. **Define what "displayed" and "confirmed" mean for an unattended order.**
   That is exactly the confirmation path this item already names as FEAT-0035's,
   and designing it here would mean designing it twice.

So the remaining work is not "wire the bot to the paper account". It is "decide
how an unattended order passes a gate built around what a human was shown" —
and that decision belongs with FEAT-0035, or in its own item if bots are wanted
to trade on paper before live execution is designed.

Until then an armed bot is evaluated like any other rule, announces, and submits
nothing. The tab says so in both locales rather than implying otherwise.

## Correction (2026-09-18, later) — the blocker was the schema, not the gate

The State section above said criteria 7 and 8 were blocked on a human decision
about how an unattended order passes `OrderGate`. Checked against the code, its
three supporting claims do not survive.

- **`DisplayedState` is not a screenshot.** Only `provider` and
  `accountFingerprint` are required, and the interface states its own contract:
  "an absent field is simply not compared, a present field that disagrees is
  always a refusal". It is what the *caller commits to*, verified against what
  is actually transmitted — and a bot can commit honestly to the symbol, the
  side and the size its own rule named. Nothing has to be invented.
- **An absent `confirmedAt` refuses nothing here.** `place-order` is `false` in
  `DEFAULT_CONFIRMATION_POLICY`, with a reason stated there, and it is not in
  `WIRED_ACTIONS` — so its settings toggle is shown disabled and no trader can
  switch it on. If `place-order` is ever wired, a bot being refused is the
  policy working as designed, and it costs no bot-specific code to get that.
- **Paper sits below the gate, not beside it.** `paperExchange` is behind
  `tradeService.signedRequest`; live and paper differ at that one call site
  (`ARCHITECTURE.md`, FEAT-0012). A bot reaching paper through
  `tradeService.placeOrder` therefore takes exactly the route a human click
  takes, which is what ADR-0012 decision 5 asks for. There is no bypass to
  design and none to refuse.

What does block it is one missing field. `tradeService.placeOrder` requires
`displayed.stopLossPrice`, because the gate re-derives an `open`'s size from
risk-per-trade and refuses a payload that disagrees — FEAT-0011. The rule
schema's `OrderIntent` carried no stop, so there was nothing to hand it. The
same gap left `size_basis: percent_risk` expressible and uncomputable: that
basis is defined as the share of equity risked *between entry and stop*, and
there was no stop.

**The stop is the feature, not the ceremony.** A bot that opens a position
without one can lose the account, and criterion 8 — "existing risk limits apply
to simulated orders" — has no risk to bound until a stop exists. So the missing
field is not an obstacle in front of the criteria; it is most of what they ask
for.

### Where the stop lives, and why it is not a price

`OrderIntent`'s own doc comment says it "carries no price, no leverage and no
venue: those come from the gate and the account at the moment of submission".
A stop *price* would break that and go stale besides — a level written into a
document is true only for the bar it was written on, and the rule fires later.

So `StopDistance` is a distance, resolved against the entry the gate is about
to submit. It is tagged by `basis` rather than being a bare number, because the
second basis is already foreseeable (a multiple of ATR is what a trader asks
for) and a bare number would make adding it a schema break for every stored
document.

Adding it inside `action` — which *is* hashed, unlike `provenance` — is free
only while the field is absent from the serialised JSON, which
`skip_serializing_if` guarantees. That is measured rather than asserted:
`stopDistance.integration.test.ts` pins the content hashes taken from the
artefact as it shipped *before* the field existed.

| PR | What |
|---|---|
| #3452 (merged) | `Provenance.derived_from_hash`, its shape validator and `InvalidDerivedFromHash` |
| #3453 (merged) | `RuleDocument::promote` and `promoteAlertToBot` — criteria 4, 5, 6, and 3's core half |
| #3454 (merged) | The Automation tab, `botStore.ts`, the sentence fix — criteria 1, 2, 3, 9, 10, 12 |
| #3455 (merged) | The (superseded) State section above |
| P4 | `OrderIntent.stop`, `percent_risk` made computable, rebuilt artefacts. Submits nothing yet |
| P5 | `botOrders.ts` and its wiring — criteria 7 and 8 |

### P5 — the seam itself

`botOrders.ts` turns one firing into one `EntryPlan` and hands it to
`orderPlacementService.placeEntryGroup` — the same function the calculator's
Place Order panel calls. From there the route is identical:
`tradeService.placeOrder` → `gatedRequest` → `OrderGate`.

**That is how criterion 8 is met.** FEAT-0013's risk limits are not re-applied
to bot orders; they sit inside the gate, and a bot's order passes through the
gate. Re-implementing them here is precisely the second path ADR-0012 decision
5 forbids, and the reason it forbids it is that the copy drifts.

The sink is a **decorator**, not a replacement: `withBotOrders` forwards every
firing to whichever sink the caller already chose and only then looks at whether
this one submits. Announcing and acting are two consequences of one event, and a
trader who armed a bot still wants to hear it fire.

A bot submits only when the trader armed it **and** paper trading is on. When it
cannot, it says so — once per rule and reason, in both locales, because a bot
that sits armed and silently does nothing looks like a strategy that found no
setup, which is worse than an alert that does not fire.

`orderPlacementService` is imported at the moment an order is placed, not at
startup: it pulls the account and TP/SL stores in behind it, and the alert engine
starts on every session, including the overwhelming majority that never arm a
bot.

## Acceptance criteria

- [x] The Automation tab lists, creates, edits, enables and disables bots
- [x] A bot is a `RuleDocument`; enabling one does not change its content hash
- [x] No document created in this tab can carry `consequence_level: send`: the tab
      writes `simulate`, and the guarantee that nothing submits is the ladder —
      `authorise(Send)` on a `simulate` document refuses, pinned by a core test. See
      the correction above for why this is not a `validate()` check
- [x] Promoting an alert creates a **new** document with a new `id`; the source alert is
      left unchanged and still armed
- [x] The promoted document records the source's content hash in `provenance`, and
      documents written before that field existed still parse
- [x] Recording the derivation changes no content hash — the pinned-hash tests still pass
- [x] A fired bot rule produces a simulated order in the paper account and nothing else
- [x] Existing risk limits apply to simulated orders
- [x] Each bot shows its rule as a plain-language sentence, in both locales, the same way
      the alert panel does
- [x] Disabling a bot stops evaluation, and Manage shows it as disabled rather than absent
- [x] The rebuilt `static/wasm/` artefacts ship in the same PR as the Rust change
- [x] German and English strings

## Out of scope

- Live execution. [`FEAT-0035`](FEAT-0035-autonomous-execution-agent.md).
- Model-proposed bots. [`FEAT-0304`](FEAT-0304-model-proposes-rules.md).
- Backtesting a bot before arming it. Wanted, and it needs a backtest path first.
- Surfacing the derivation chain anywhere but the bot's own detail view. Showing an
  alert which bots descend from it is a reverse lookup, and it earns its own item.

## Links

- [`docs/alert-system.md`](../../alert-system.md) — one document, three surfaces
- [`ADR-0012`](../../adr/0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md)
- [`FEAT-0035`](FEAT-0035-autonomous-execution-agent.md) — the `send` rung
- `technicals-wasm/src/rule/document.rs` — `Provenance`, `EXCLUDED_FROM_HASH`
- `src/components/settings/tabs/`, `src/stores/ui.svelte.ts`
