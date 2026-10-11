---
id: BUG-0669
title: Paper trading on Bitget cannot carry a stop, so the workflow cannot be rehearsed
type: bug
status: done
priority: P1
milestone: none
editions: [community, pro, private]
area: execution
data_class: none
adr: none
depends_on: []
assignee: opencode
shipped: unreleased
branch: fix/paper-mode-stop
---

# BUG-0669 — Paper trading on Bitget cannot carry a stop, so the workflow cannot be rehearsed

## Symptom

On Bitget the trade panel refuses any entry that carries a stop, refusing it as
`unplaceableStop`: *"bitget kann den Stop-Loss für diese Order nicht
platzieren — weder zusammen mit der Einstiegsorder noch als separate Order."*
**Paper trading is refused the same way**, though a paper order never leaves the
browser. Observed 2026-10-11 on `dev.cachy.app` with the paper toggle on: the
same refusal, the same "nicht gesendet" notice.

The consequence is that a trader who wants to rehearse a protected entry on the
venue they actually use cannot: the rehearsal is blocked by a capability of a
venue the rehearsal never contacts.

## Cause

Four layers each answered the venue's capability question, and paper mode needs
a different answer at every one of them. Fixing only the first (as the first
commit on this branch did) merely swaps one refusal for the next:

1. `orderGate.verify` refused `unplaceableStop` — `canCarryStopLoss(caps)` with
   the venue's caps.
2. The next rule, `unsupportedTpSlAtEntry`, refused the attached form.
3. `orderPlacementService.placeEntryGroup` set `attach = caps.tpSlAtEntry`, so
   on Bitget the payload never carried a stop and `checkPrices` refused the
   displayed stop as `missing`.
4. `bitgetAdapter.trading.fetchTpSlOrders` resolved `[]` on `SUPPORTS.tpSl ===
   false` without reaching the simulator, so the confirmation read after every
   entry could not see a stop that really was booked. The adapter's answer is
   correct for the world it asks about, and the adapter may not read the mode
   (services must not import stores — `eslint.config.js`), so the decision
   belongs one layer up.

The paper seam itself is correct: `tradeService.ts:458` stops the request, and
`paperExchange` books attached protection as a real plan row
(`attachEntryPlans`, `paperExchange.ts:701`). `createTpSlService`'s credential
guard was already paper-aware for the same reason (FEAT-0327) — its own comment
names this defect's symptom.

## Fix

Paper mode is exempt from the venue's stop capability at each place that asks,
and paper attaches the protection so the simulator really books it:

- `orderGate.ts` — `paperMode` exempts `unplaceableStop` and
  `unsupportedTpSlAtEntry`. Live is unchanged; the mode is re-read at transmit
  time by `assertGatePass` (`orderGate.ts:2230`), so this cannot leak into a
  live request.
- `orderPlacementService.ts` — `attach = caps.tpSlAtEntry || paperState.enabled`
  so the stop rides on the entry payload, which is how `paperExchange` books it.
- `stores/tpsl.svelte.ts` — a `readTpSlOrders` helper that reads through the
  paper seam when nothing is sent and leaves the venue-guarded adapter read for
  live. Both callers use it (`tpsl.svelte.ts`'s `ensureFresh`, which is what
  `orderPlacementService.confirmProtection` reads, and `TpSlList.svelte`), so
  the decision exists once.
- `PlaceOrderPanel.svelte` — the unplaceable-stop warning is suppressed in
  paper, because a warning the gate will not act on is the BUG-0649 defect.
- `paperTrading_seam.test.ts` — the new mode read in `orderPlacementService`
  registered in the inventory, which is the guard that exists to make this
  deliberate.

Leave alone: live Bitget (still refuses — the venue genuinely cannot carry the
stop), TP/SL placement modes, the paper simulator, and the read-side controls
(`PositionsSidebar`'s standalone TP/SL entry is a separate action).

## Acceptance criteria

- [x] A test reproduces the defect and fails without the fix — paper entry on
      Bitget carrying a stop is refused (all three behaviour changes proven RED
      separately)
- [x] A paper entry may carry a stop on any venue; the gate approves it
      (`orderGate.capabilities.test.ts` asserts `approved === true`)
- [x] The stop really reaches the simulated book — the payload carries it
      (`orderPlacementService.gateIntegration.test.ts`) and `paperExchange`
      books attached protection as a plan row (existing
      `paperExchange.test.ts:327`)
- [x] The confirmation read finds it — `readTpSlOrders` goes through the paper
      seam instead of the adapter's empty answer (`stores/tpsl.test.ts`,
      Bitget named so the two paths are distinguishable)
- [x] A live Bitget entry with a stop is still refused as `unplaceableStop`
- [x] The trade panel shows no "unplaceable stop" warning in paper mode, and
      still shows it live
- [x] Tests pass with the fix (611 across 52 files)
- [x] German and English strings for any touched UI — none added, no new copy

## Review follow-ups (swarm, 2026-10-11)

Four read-only reviewers ran on the first commit of this branch. Two found the
same blocker independently: exempting `unplaceableStop` alone did not make a
paper stop placeable — it swapped that refusal for `checkPrices`' `missing`,
and the new test passed anyway because it asserted the absence of a refusal
rather than `approved`. Both are fixed here: the test asserts the outcome, and
the four layers above were traced to the end.

Worth knowing: the reviewer that found it also confirmed the live path cannot
be reached by the exemption (`assertGatePass` compares the mode at transmit
time), and that no other consumer reads the panel's `stopPlacement`, so the
suppression changes what the panel says and never what it sends.

Still open, deliberately: `PositionsSidebar`'s standalone TP/SL entry stays
venue-gated in paper too, so a paper position on Bitget has no UI path to add a
plan after the fact. Separate action, separate item if wanted.

## Out of scope

- Bitget UTA vs Classic routing (ADR-0023)
- Whether paper mode should *model* a venue that cannot take a stop at all
  (the trader asked for stops to be usable in paper; fidelity to the venue's
  limitation is a separate design question)
- The live unplaceable-stop refusal on Bitget

## Links

- BUG-0503 — the unplaceable-stop rule this exempts
- BUG-0649 — the panel-warning contract (panel must not describe a refusal the
  gate will not make); this fix keeps both halves in step
- FEAT-0012 — paper trading; the paper seam in `tradeService`
- ADR-0023 — UTA-only (no venue-side stop route exists on Bitget)