---
id: FEAT-0806
title: Attribute paper trades and journal entries to their bot
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
size: S
estimate: 3
---

# FEAT-0806 — Attribute paper trades and journal entries to their bot

## Problem

A paper position opened by a bot and one opened by hand look identical in the
book and in the journal. `JournalEntry` has `isPaper` and `isManual`, but no
`ruleId`, no bot id and no strategy hash; `PaperPosition`, `PaperFill` and
`PositionMetadata` have no owner at all. So the journal can answer "did paper
trading work?" but not "which bot works?", and ADR-0020's claim that the
content hash is what a journal entry records is not true in the
implementation.

This is the cheapest item in the epic and the prerequisite for every review
feature that follows.

## Proposal

Carry attribution from the firing rule into the paper book and the journal:

- `PaperPosition` metadata gains `origin: "bot" | "manual"`, `botId?`,
  `ruleId?`, `strategyHash?`.
- `PaperFill` records the same on the opening fill, so attribution survives
  metadata eviction (the book caps at 500 fills).
- `JournalEntry` gains optional `origin`, `botId`, `ruleId`, `strategyHash`;
  absent on old entries means "manual or unknown", which is honest.
- `paperJournalService` copies the fields when it creates and refreshes an
  entry; reconciliation after a reload keeps them.
- A bot whose rule was deleted still resolves its id and hash from the book; the
  journal must not crash or silently drop the attribution.

The fields are optional so no migration is needed and an older build parses the
blob.

## Acceptance criteria

- [ ] A paper entry opened by a bot persists `origin: "bot"` with `botId`,
      `ruleId` and the 64-hex `strategyHash`; a manual entry persists
      `origin: "manual"` and no bot fields.
- [ ] The journal entry created for that position carries the same four fields;
      an entry written before this change still parses and reads as unattributed.
- [ ] The opening fill carries `botId` and `strategyHash`, so a position whose
      metadata was evicted still has an attributable fill.
- [ ] A reload reconciles the paper book and the journal without losing the
      attribution — pinned by a test that persists, reloads and reconciles.
- [ ] Deleting the bot rule after the fill leaves the position and journal entry
      attributable and renderable.
- [ ] No new storage key, no network call, no rule data leaves the device
      (ADR-0001).
- [ ] Tests cover bot vs manual, the pre-field blob, and the deleted-rule case.

## Out of scope

- The Bots tab and any UI (FEAT-0808).
- Per-bot analytics (FEAT-0812).
- Ownership reservation and exits (FEAT-0809, FEAT-0810).
- Backfilling attribution for trades that predate the change; they stay
  unattributed.

## Open questions

- Whether `strategyHash` belongs on every fill or only on the opening fill.
  Proposal: opening fill plus position metadata; closing fills inherit by
  `positionId`.

## Links

- [`ADR-0026`](../../adr/0026-a-bot-owns-the-position-it-opens.md)
- [`ADR-0020`](../../adr/0020-automation-envelope-promotion-and-simulate-bots.md)
- [`FEAT-0805`](FEAT-0805-bot-system-v2-from-conditional-orders-to-strategies.md)
- Code: `src/services/paperJournalService.ts`,
  `src/stores/paperTrading.svelte.ts`, `src/stores/types.ts`,
  `src/services/alertEngine/botOrders.ts`
