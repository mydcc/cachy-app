---
id: IDEA-0831
title: Community exchange for strategy templates
type: idea
status: idea
priority: P3
milestone: none
editions: [pro, private]
area: alerts
data_class: A
adr: ADR-0001
depends_on: [FEAT-0818]
size: L
estimate: 13
---

# IDEA-0831 — Community exchange for strategy templates

## Problem

Once a trader can save his own bots as templates and export/import them
(FEAT-0818 extension), the natural next wish is sharing: traders improving
each other's setups, the community curating what works. The product owner
named this explicitly as a *later* stage (2026-11-18) — after personal
templates exist, not before.

## Why it is parked, not planned

Sharing a strategy template is **user-directed egress of Class A data**
(ADR-0001): what symbols someone trades, which exits he trusts — the
strategy *is* user data. So any exchange must be opt-in, consent-per-share,
and provably reversible (unshare). That is a product surface of its own
with real trust decisions, not a checkbox on export.

## What it would build on

- The versioned template schema and draft-validated imports from
  FEAT-0818 — the exchange format already exists by then; only transport
  and discovery are new.
- Provenance and citations: a shared template keeps `derived_from_hash` and
  the author's attribution; a template with a performance *claim* is
  refused by convention, same rule as the curated library.
- No auto-sync: importing is always a deliberate user action that produces
  an unarmed draft.

## Links

- [`ADR-0001`](../../adr/0001-local-first-boundary.md)
- [`FEAT-0818`](../features/FEAT-0818-curated-literature-strategy-templates.md)
- [`FEAT-0826`](../features/FEAT-0826-overhaul-the-public-documentation-for-the-bot-era.md)
