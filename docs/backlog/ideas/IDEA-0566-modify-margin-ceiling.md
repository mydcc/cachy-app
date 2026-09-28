---
id: IDEA-0566
title: Prospective margin ceiling for quantity-increasing modifies
type: idea
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: [BUG-0548, BUG-0549]
---

# IDEA-0566 — Prospective margin ceiling for quantity-increasing modifies

Since BUG-0549 the gate measures required margin against the free balance
for opens and adds — but `checkMargin` never runs for `modify`, so a
quantity increase that BUG-0548's size and loss ceilings permit can still
grow the margin exposure past what the account holds. After BUG-0549 the
modify path is the remaining way around the balance check. Worst case is a
venue reject, not a fund loss, which is why this is an idea and not a bug.

## Proposal

Evaluate the resulting position's prospective margin exposure
(`qty × price / leverage`, same gross-of-fees basis as `checkMargin`)
against `availableMargin` for quantity-increasing modifies, reusing the
`insufficientMargin` refusal. Absent or non-finite balance behaves like an
open's skip (recorded, not silent — see `availableMarginUnmeasured`).

## Out of scope

- Locking or reservation between verify and send: sequential intents are
  each measured against the same balance and only the venue sees the
  total. Named limitation, not fixed here.
- The shared `coversMargin(required, available)` comparison and the
  `freeSettlementBalance()` selector (M4 long term): unifies the
  calculator, panel and gate comparisons and replaces the three inline
  `assets.find(USDT)` reads. Sensible cleanup to do alongside, not
  required for the ceiling itself.
- Reducing modifies and price-only edits: no new exposure, stay exempt.

## Acceptance criteria

- [ ] A quantity-increasing modify whose resulting margin exceeds the free balance is refused with `insufficientMargin`
- [ ] A funded increase still passes; price-only and reducing modifies are unaffected (regression tests)
- [ ] Absent balance on a modify records the skip instead of silently passing
- [ ] `npm run backlog:check` passes with this item (index regenerated in the same PR)

## Links

- `src/services/orderGate.ts` (`checkMargin`, open/add gating)
- BUG-0548 (modify risk ceilings), BUG-0549 (balance measurement)
