---
id: FEAT-0826
title: Overhaul the public documentation for the bot era
type: feature
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: docs
data_class: none
adr: none
depends_on: []
parent: FEAT-0805
size: M
estimate: 5
---

# FEAT-0826 — Overhaul the public documentation for the bot era

## Problem

The public documentation positions Cachy as a position-size calculator and
risk manager. With the bot system the product promise changes: the trader
can build *his own* bot — from a plain alarm to a strategy with exits —
locally, with a mandatory stop and one gate. Every page that still describes
only the old promise undersells the product and confuses the vocabulary
("alert" vs "bot" vs "conditional order").

The product owner's direction (review rounds, 2026-11-18): the defined goal
belongs in the documentation (vision, whitepaper, milestones), the
positioning must be reworked because Cachy is "no longer purely a position
size and risk manager", and — money topic discipline — nothing may be
invented: performance claims are forbidden, and owner-supplied reference
material is distilled, not quoted by URL.

## Proposal

- **Goal statement lands in the core docs**: VISION and the whitepaper carry
  the agreed formulation — a trader can create any bot, keeps the complete
  overview including bots that have not yet acted, and can change any
  running strategy without losing the track record.
- **Positioning pass**: every public-facing page is checked against the new
  promise (calculator and risk management remain true — they are *not*
  demoted — but the bot workshop and the local-first automation story are
  added).
- **Vocabulary section** ("Bot vs. alarm vs. order"): the boundary of the
  trigger-order metaphor — a waiting bot *behaves* like a resting
  conditional entry; a bot is not an order (it owns a position, recurs,
  versions). `docs/alert-system.md` gains the short "Bot vs. Order" section;
  marketing-level pages reference it instead of re-defining.
- **Milestones/roadmap** reflect the bot system epic (FEAT-0805) with its
  milestones so the public plan matches the backlog.
- **Source discipline**: no profitability claims anywhere; curated-template
  citations follow FEAT-0818's rules; owner-supplied industry literature is
  never cited by URL (per owner instruction — distilled knowledge only).

## Acceptance criteria

- [ ] VISION/whitepaper state the bot-era goal in the agreed wording (EN,
      with the German locale consistent where translated).
- [ ] No public page still claims Cachy is *only* a position-size and
      risk tool; the calculator/risk story remains intact alongside.
- [ ] `docs/alert-system.md` contains the "Bot vs. Order" section and the
      alert/bot vocabulary is used consistently across docs.
- [ ] `docs/MILESTONES.md`/ROADMAP list the bot epic and its milestones.
- [ ] Zero performance or profitability claims in the touched pages;
      template citations follow FEAT-0818's format.
- [ ] Links resolve (`npm run docs:links` green).

## Out of scope

- Redesigning the marketing site or landing pages beyond text alignment.
- The tutorial/academy content for bots (ships with the features it
  teaches, not ahead of them).
- Any claim about backtesting (an idea, [`IDEA-0827`](../ideas/IDEA-0827-backtesting-engine.md),
  not a promise).

## Open questions

- Whether the whitepaper's "who is Cachy for" section gains a trader-type
  framing (A: alarm only, B: promote later, C: direct strategy).
  Proposal: yes — it is the clearest way to explain one concept, no stages.

## Links

- [`FEAT-0805`](FEAT-0805-bot-system-v2-from-conditional-orders-to-strategies.md)
- [`FEAT-0818`](FEAT-0818-curated-literature-strategy-templates.md)
- [`IDEA-0827`](../ideas/IDEA-0827-backtesting-engine.md)
- Docs: `docs/VISION.md`, `docs/MILESTONES.md`, `docs/ROADMAP.md`,
  `docs/alert-system.md`, whitepaper pages under `src/routes/[[lang]]/(seo)/`
