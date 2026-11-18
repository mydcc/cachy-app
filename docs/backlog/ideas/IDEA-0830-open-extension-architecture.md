---
id: IDEA-0830
title: Open extension architecture — the document schema as the public contract
type: idea
status: idea
priority: P3
milestone: none
editions: [community, pro, private]
area: core
data_class: A
adr: ADR-0012
depends_on: []
size: L
estimate: 13
---

# IDEA-0830 — Open extension architecture: the document schema as the public contract

## Problem

The product owner's long-term direction (2026-11-18): Cachy is to be an
**open system**, extensible from the outside — up to the vision that
something like a digital contract (smart-contract style) could later be
built on top, e.g. by the community. The architecture we build today must
leave that door open: compatible with new languages and systems, **secure
and unassailable from the outside, solid, transparent and self-repairing
inside**.

This idea records how today's architecture stays compatible *without*
deciding anything about smart contracts today.

## What "open" means concretely

- **The versioned document schema is the public contract.** Export/import,
  templates (FEAT-0818), backups — every external thing speaks the schema,
  never the app's internals. Extensions couple to the schema, so the core
  can keep evolving.
- **Adapters at the edge, never core rewrites.** Multi-account binding
  (FEAT-0825) is the first concrete adapter; a future on-chain or
  smart-contract layer would be another edge adapter with its own ADR —
  while ADR-0012's line stands: executable code never enters local
  strategy evaluation.
- **Self-repairing inside** is already the plan: reload reconciliation,
  restart mid-exit recovery, guard log (FEAT-0822), versioned track records.
  The system recovers from any state instead of rotting.
- **Unassailable from outside** is already the plan: Class A locality, no
  external write or arm path, template imports as user-confirmed drafts.

## What is deliberately *not* decided

Whether a smart-contract integration ever happens, in what form, on which
chain. This idea only guarantees the door stays open and names the seam
(schema + adapters + gate).

## Links

- [`ADR-0001`](../../adr/0001-local-first-boundary.md)
- [`ADR-0012`](../../adr/0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md)
- [`FEAT-0825`](../features/FEAT-0825-bind-every-bot-to-one-account-and-show-only-the-active-account.md)
- [`FEAT-0818`](../features/FEAT-0818-curated-literature-strategy-templates.md)
- [`FEAT-0822`](../features/FEAT-0822-bot-firing-policy-and-guards.md)
