---
id: FEAT-0833
title: Carry a model's proposed exits into bot creation
type: feature
status: specced
priority: P3
milestone: none
editions: [pro, private]
area: execution
data_class: A
adr: ADR-0030
depends_on: [FEAT-0817]
parent: FEAT-0805
size: S
estimate: 3
---

# FEAT-0833 — Carry a model's proposed exits into bot creation

## Problem

ADR-0030 decision 5 grants the model three things: conditions, veto and exits.
The first two reach a document; the third currently reaches a banner.

The reason is the core, and it is right: `RuleDocument::validate` refuses
`exits` on a `notify` document (`RefusalCode::ExitsAtNotifyLevel` — "a `notify`
rule carries an exit nothing will ever evaluate"), because an alert owns no
position to close. So FEAT-0817 parses the model's proposed exits, shows them,
and holds them in the authoring tab's own state, deliberately never writing
them into the notify draft.

What is missing is the other end. A trader who reads "two exits proposed",
saves the draft and later promotes it to a bot gets a bot without them, and
has to retype from memory what the model worked out. The exits are also lost
on a tab switch or a page reload, because component state does not survive
either. The owner decided on 2026-11-21 that they are to travel at promotion.

## Proposal

Give the promotion path an optional exits argument, and key the staged exits
to the rule they were authored for.

- `promoteAlertToBot(alertId, order, createdAtMs, exits?)`. After
  `ruleSchema.promote(...)` has derived the bot, attach the exits and run the
  result through `ruleSchema.validate` — so the *core* approves them at
  `simulate` level, rather than TypeScript assuming a level change makes them
  legal. A refusal must surface as a refusal, not as a thrown error.
- Staged exits travel as `{ ruleId, exits }`, never as a bare array.
  Promotion applies them only when `ruleId` matches the alert being promoted.
  Without that key, a model's exits would attach to whichever alert the trader
  happens to promote next — a wrong exit on a real position, which is a
  correctness fault and not a cosmetic one.
- The single call site is `BotsTab.svelte`'s `promote()`.

## Acceptance criteria

- [ ] A draft authored with proposed exits, saved and then promoted, produces
      a bot whose `exits` are the proposed ones, validated by the core at
      `simulate` level.
- [ ] Promoting a *different* alert never attaches the staged exits.
- [ ] `promoteAlertToBot` called without the new argument behaves exactly as
      today; the existing promotion tests pass unchanged.
- [ ] An exit the core refuses at `simulate` level is reported field by field
      and no bot is written.
- [ ] Promotion still sets `provenance.source: human` and drops
      `provenance.model` (ADR-0030 decision 7): carrying exits does not carry
      attribution, and the lineage stays in `derived_from_hash`.
- [ ] No path added here writes, alters or infers a stop. The stop stays the
      trader's and is still required before arming.
- [ ] A promoted bot still comes back disarmed.

## Out of scope

- Letting the model propose a stop, an order, a size or a consequence level.
  That line is ADR-0030 decision 5 and ADR-0020 decision 6, and it does not
  move here.
- Changing `RuleDocument::promote` in the core.
- Allowing `exits` on a `notify` document. The refusal is correct; this item
  works with it, not around it.
- Re-asking the model at promotion time. The exits travel; they are not
  regenerated, because a second answer would not be the one the trader read.

## Open questions

- **Durability.** Component state loses the staged exits on a reload, which
  makes "save now, promote tomorrow" lose them silently — the worst shape,
  because the trader was shown them. Two candidates: keep the staging
  session-scoped and say so where the exits are shown, or persist it as its
  own Class A entry. A persisted one needs a home the core does not refuse,
  which is the harder half of this item.
- Whether `createBotDraft` — which already accepts `exits?: ExitRule[]` —
  should become the one path, with promotion routed through it, rather than
  two functions that both assemble a bot.

## Links

- [`FEAT-0817`](FEAT-0817-ai-assisted-rule-authoring.md) — stages and shows
  the exits; this item moves them.
- [`ADR-0030`](../../adr/0030-a-strategy-draft-goes-out-browser-direct-and-comes-back-unarmed.md)
  — decisions 5 and 7.
- [`ADR-0020`](../../adr/0020-automation-envelope-promotion-and-simulate-bots.md)
  — the promotion envelope and the stop requirement.
- `src/services/alertEngine/promoteAlert.ts` — `promoteAlertToBot`,
  `createBotDraft`.
- `src/components/alerts/bots/BotsTab.svelte` — the one promotion call site.
- `src/components/alerts/tabs/AuthoringTab.svelte` — where the exits are
  staged today (`stagedExits`).
- `technicals-wasm/src/rule/document.rs` — `ExitsAtNotifyLevel`, `promote`.
