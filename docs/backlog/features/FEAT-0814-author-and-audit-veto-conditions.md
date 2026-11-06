---
id: FEAT-0814
title: Author and audit veto conditions
type: feature
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: []
parent: FEAT-0805
size: M
estimate: 5
---

# FEAT-0814 — Author and audit veto conditions

## Problem

`RuleDocument.veto` exists and is evaluated by the core, and
`docs/alert-system.md` documents it as "optional suppression, the only place a
third-party feed is legal". But no Svelte component references `veto`: it cannot
be authored, inspected or removed from the app. A trader therefore cannot say
"take this setup only if the higher-timeframe trend agrees", and a bot that is
suppressed by a veto says nothing — it looks like a strategy that found no
setup.

## Proposal

Make the existing contract usable and visible:

- A **Veto** section in the rule builder using the same condition components as
  the trigger, with its own sentence and an explicit "no veto" empty state.
- Veto conditions may read `external_feed` (the core already permits it there
  and refuses it in `conditions`).
- A suppression record in the firing log: when a trigger was suppressed by the
  veto, write an entry naming the rule, the symbol, the candle and the veto
  clause that refused. A bot additionally surfaces "not traded: veto" instead of
  staying silent.
- The list row shows that a rule has a veto (a small badge, not a second
  sentence).
- Refusals are anchored to the veto field and rendered in both locales.

## Acceptance criteria

- [ ] A veto can be added, edited and removed; a document without one keeps its
      existing hash.
- [ ] A trigger whose conditions hold but whose veto refuses writes a
      suppression entry naming the veto clause, and the bot does not submit.
- [ ] A trigger with no veto writes exactly today's entries — no new noise.
- [ ] `external_feed` is accepted inside the veto editor and still refused
      inside the trigger editor with a field-naming error.
- [ ] A rule with a veto shows a badge on its list row; the sentence is not
      duplicated.
- [ ] Suppression entries survive a reload and are filterable in the log.
- [ ] Tests: veto suppresses, veto allows, removal restores firing, and the
      refusal path.

## Out of scope

- New feed sources; FEAT-0816 wires funding/open interest/fear-and-greed.
- Using the veto as an exit. A veto refuses a trigger; exits are FEAT-0809/0810.
- AI-generated vetoes (FEAT-0817 may propose them, but this item is manual).

## Open questions

- Whether a suppression entry belongs in the firing ledger or a separate
  suppression ledger. Proposal: the same ledger with a `suppressed` verdict, so
  the log has one chronology.
- Whether a veto should also block an exit. Proposal: no — exits are the bot's
  safety, and a feed outage must not trap a position.

## Links

- [`ADR-0012`](../../adr/0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md)
- [`IDEA-0305`](../ideas/IDEA-0305-external-market-context-as-veto.md)
- [`FEAT-0816`](FEAT-0816-external-market-context-as-a-veto-feed.md)
- Code: `src/lib/rules/indicatorRequests.ts`, `docs/alert-system.md`
