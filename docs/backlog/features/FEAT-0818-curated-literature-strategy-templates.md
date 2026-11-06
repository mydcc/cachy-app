---
id: FEAT-0818
title: Curate a literature-backed strategy template library
type: feature
status: specced
priority: P3
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

# FEAT-0818 — Curate a literature-backed strategy template library

## Problem

The template library (FEAT-0391) offers starting points, but it does not say
where a pattern comes from, what it assumes, or how the long and short variants
differ. A trader coming from professional tools expects a vocabulary they can
check: "this is Wilder's ADX filter", "this is an RSI failure swing", "this exit
is the one the source recommends" — with a citation, not a vibe.

## Proposal

Extend the template library with a curated, cited set of strategy patterns:

- Each template is a **validated** `RuleDocument` (conditions, optional veto,
  optional exits) plus a short annotation: source, idea, assumptions, typical
  failure mode.
- Long and short variants are separate templates, never a "direction" flag that
  silently rewrites a condition.
- Parameters are exposed with sane ranges; the template explains what changing
  them does.
- Importing a template creates a **draft** (not armed), provenance
  `source: "human"` with a `derived_from_hash` link to the template's document.
- No profitability claims. The library says what a pattern is, not what it will
  earn.
- Citations use the project's existing reference style; the library ships as
  static local content, so it stays Class A and works offline.

The library is also the grounding material for FEAT-0817: a model that proposes
a rule can point at the template it started from.

## Acceptance criteria

- [ ] At least eight templates across trend, mean-reversion and breakout, each
      validating against the current core.
- [ ] Every template carries a source citation, an assumptions note and a
      failure-mode note.
- [ ] Long and short variants exist where the direction changes the conditions,
      and each is its own document.
- [ ] Importing creates an unarmed draft with `derived_from_hash` set; it never
      arms or executes.
- [ ] Template text makes no performance claim and passes the docs review for
      that rule.
- [ ] The library works offline and adds no network call.
- [ ] Tests: every template validates, every template imports, and an edited
      template no longer claims the citation.

## Out of scope

- AI-generated templates (FEAT-0817 may draft them later).
- Backtests or expected-return figures.
- Paid or licensed material; only public-domain or properly cited ideas.
- A marketplace for user-published templates.

## Open questions

- The initial source list and citation format; proposal: one canonical book per
  pattern family, cited by chapter, not page.
- Whether templates may include exits now or wait for FEAT-0809. Proposal: ship
  entries first, add exits when the schema lands.
- Whether template names are localized or kept as proper names with a localized
  description. Proposal: proper name plus localized description.

## Links

- [`FEAT-0391`](FEAT-0391-alert-template-library.md)
- [`FEAT-0817`](FEAT-0817-ai-assisted-rule-authoring.md)
- [`TODO.md`](../../TODO.md#37-literature-template-library-scope-and-citations)
