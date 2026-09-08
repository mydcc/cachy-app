---
id: FEAT-0416
title: Record the account read protocol as an ADR
type: feature
status: done
priority: P3
milestone: none
editions: [community, pro, private]
area: docs
data_class: none
adr: none
depends_on: []
---

# FEAT-0416 — Record the account read protocol as an ADR

## Problem

Reading account state correctly now requires knowing three rules that live
only in comments next to the code that follows them:

1. Take an ordering ticket before the first `await`, and claim it immediately
   before the write (BUG-0412).
2. Write mode values through the setter so the freshness stamp travels with
   the value (BUG-0409).
3. Never pair two halves whose stamps are far apart; show the older half as
   unknown instead (BUG-0409).

A new reader of `/api/account` or `/api/leverage-margin-mode` that misses any
of these ages dishonestly, and nothing complains. Three bugs in this class have
now been fixed one at a time; the fourth is cheaper to prevent than to debug.

## Proposal

One ADR under `docs/adr/`, short, stating where account state may be read,
where it may be written, and what must never happen. Not a tutorial — a
constraint, in the form ADRs already use in this repo.

Write it **after** the encapsulation work, not before (open as #2757, the CI guard, and #2759, the setter-only fields). Making the fields
setter-only removes rule 2 from prose entirely: the compiler states it. What
remains to write down is only what types cannot express — chiefly the ordering
discipline and the pairing rule.

## Acceptance criteria

- [x] An ADR exists under `docs/adr/` covering the ordering ticket and the
      pairing rule — [ADR-0015](../../adr/0015-account-state-is-read-under-a-ticket-and-never-paired-across-time.md)
- [x] It states what the type system already enforces, and does not repeat it
- [x] `docs/ARCHITECTURE.md` links to it rather than restating it
- [ ] Existing comments in `accountReadOrder.ts`, `tradeService.ts` and
      `ExchangeAccountControls.svelte` point at the ADR instead of each
      explaining the protocol again — left as follow-up: they explain *local*
      reasons and are useful where they are; collapsing them is a separate
      readability pass, not part of recording the decision

## Out of scope

- Implementing the encapsulation itself (setter-only fields, CI guard) —
  tracked separately; this entry only records the protocol once it exists.
- Rewriting every existing comment beyond pointing at the ADR.
- Tutorial-style documentation; the ADR states constraints, not usage.

## Links

- [BUG-0409](../bugs/BUG-0409-mode-chip-stale-after-change.md) — introduced the freshness stamps
- [BUG-0412](../bugs/BUG-0412-duplicate-sidebar-account-fetch-race.md) — introduced the ordering ticket
