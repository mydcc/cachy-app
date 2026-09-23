---
id: FEAT-0529
title: Carry the drawing anchor inside the rule document
type: feature
status: idea
priority: P2
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: [BUG-0498]
---

# FEAT-0529 — Carry the drawing anchor inside the rule document

## Problem

A drawing alert's binding to its chart line lives in a side ledger
(`RULE_DRAWING_STORAGE_KEY`), independent of the rule it binds. When that
ledger entry is lost — unreadable store, failed write on a full quota — the
rule is still a perfectly valid document describing a constant, and no layer
can tell "this was never a drawing alert" from "this was one, and the
evidence is gone". BUG-0498 made the failure loud (hold with
`drawing-anchor-ledger-unreadable`), but the hold necessarily catches
ordinary price alerts too, because they share the same document shape. The
class is reported, not closed.

## Proposal

Store the `drawingId` in the rule document itself at arm time, so the binding
cannot outlive or predecease the rule. The side ledger becomes a
read-through cache or goes away. The resolver then distinguishes three cases
by document shape alone: never drawing-anchored (evaluate normally),
anchored with a resolvable drawing (follow the line), anchored with a lost
drawing (refuse with the BUG-0498 reason). This lifts the accepted deviation
that currently holds drawing-shaped price alerts while the ledger is
unreadable.

## Acceptance criteria

- [ ] A rule armed on a drawing carries its `drawingId` in the stored document
- [ ] A lost anchor on such a rule refuses with `drawing-anchor-ledger-unreadable`
      (or its successor reason) while an ordinary price alert on the same
      shape evaluates normally
- [ ] Existing anchored rules migrate: ledger entries with a live drawing gain
      the `drawingId`, entries without one refuse instead of silently freezing
- [ ] Deleting the drawing still disarms or refuses through the existing
      `reconcileDrawingRules` path, covered by a test

## Out of scope

- Changing what the resolver does with an unresolvable drawing (that is
  BUG-0498 behaviour, kept as is)
- Touching the evaluation gate or the backfill replay (BUG-0486, BUG-0483)
- Any server or sync of rules: Class A stays on the device, no new data class

## Open questions

- Does `drawingId` enter the rule content hash? If yes, re-anchoring after a
  drawing recreate changes the hash and resets gate anchors; if no, two
  different lines could share an identity.
- What happens to ledger entries whose drawing is already gone at migration
  time — refuse once with a notice, or drop with a ledger tombstone?
- Does the ledger survive as a write-through cache for the panel's fast path,
  or is it deleted outright (including its storage key)?

## Links

- `docs/backlog/bugs/BUG-0498-lost-drawing-anchor-silently-freezes-the-level.md` — the reported-not-closed gap, including the accepted deviation
- `src/services/alertEngine/drawingThreshold.ts` — the resolver to reshape
- `src/services/alertEngine/drawingAnchors.ts` — the ledger to absorb
- `src/services/alertEngine/reconcileDrawingRules.ts` — the deletion path to keep
- `docs/backlog/features/FEAT-0029-drawing-alerts.md` — the feature this strengthens
