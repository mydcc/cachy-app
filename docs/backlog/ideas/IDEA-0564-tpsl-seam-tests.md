---
id: IDEA-0564
title: Seam-level TPSL tests for tick misalignment and position-less drops
type: idea
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: execution
data_class: none
adr: none
depends_on: []
---

# IDEA-0564 — Seam-level TPSL tests for tick misalignment and position-less drops

Follow-up to the BUG-0550 review (PR #3649). The direction rule itself is
covered at validator, gate, service, paper and component level; what remains
is two seams the review named that only have validator-level proof.

## Proposal

1. **Tick misalignment at the seam.** `validateTpSlPrice` refuses
   off-tick levels, but no test drives a misaligned level through
   `paperExchange.handle("/api/tpsl", …)` or `tradeService.modifyTpSlOrder`
   with a real `tickSize`. Add both: a misaligned modify refuses with
   `PAPER_TPSL_INVALID` / `OrderRefusedError` before transport.
2. **Position-less chart drop.** `dropPassesPrecheck` in
   `CandleChartView.svelte` toasts `orderGate.invalidTpSl` when no position
   backs the dragged line. The wrong-side drop has a component test
   asserting the interpolated values; the missing-position drop has none.
   Add one asserting the toast and no adapter call.

## Out of scope

- New validation logic — both paths already refuse; this is proof only.
- The modal-guard internals (`hasInvalidTpSl`): unreachable via UI now that
  the slider gates `onChange`, covered behaviorally (feedback, no-send) and
  at every layer below.

## Acceptance criteria

- [ ] A tick-misaligned modify through the paper seam refuses before transport
- [ ] A tick-misaligned modify through the live service seam refuses before transport
- [ ] A chart drop with no matching position toasts and never calls the adapter
- [ ] `npm run backlog:check` passes with this item (index regenerated in the same PR)
