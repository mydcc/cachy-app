---
id: FEAT-0416
title: Record the account read protocol as an ADR
type: feature
status: idea
priority: P3
milestone: none
editions: [community, pro, private]
area: docs
data_class: none
adr: none
depends_on: [BUG-0415]
---

# FEAT-0416 — Record the account read protocol as an ADR

## Problem

Reading account state correctly now requires knowing three rules that live
only in comments next to the code that follows them:

1. Take an ordering ticket before the first `await`, and claim it immediately
   before the write (BUG-0412).
2. Write mode values through the setter so the freshness stamp travels with
   the value (BUG-0409, BUG-0415).
3. Never pair two halves whose stamps are far apart; show the older half as
   unknown instead (BUG-0409).

A new reader of `/api/account` or `/api/leverage-margin-mode` that misses any
of these ages dishonestly, and nothing complains. Three bugs in this class have
now been fixed one at a time; the fourth is cheaper to prevent than to debug.

## Proposal

One ADR under `docs/adr/`, short, stating where account state may be read,
where it may be written, and what must never happen. Not a tutorial — a
constraint, in the form ADRs already use in this repo.

Write it **after** BUG-0415 lands, not before. Encapsulation removes rule 2
from prose entirely: once the fields are private, the compiler states it. What
remains to write down is only what types cannot express — chiefly the ordering
discipline and the pairing rule.

## Acceptance criteria

- [ ] An ADR exists under `docs/adr/` covering the ordering ticket and the
      pairing rule
- [ ] It states what the type system already enforces after BUG-0415, and does
      not repeat it
- [ ] `docs/ARCHITECTURE.md` links to it rather than restating it
- [ ] Existing comments in `accountReadOrder.ts`, `tradeService.ts` and
      `ExchangeAccountControls.svelte` point at the ADR instead of each
      explaining the protocol again

## Links

- [BUG-0415](../bugs/BUG-0415-paper-sync-bypasses-position-mode-setter.md) — decides how much of this is left to write
