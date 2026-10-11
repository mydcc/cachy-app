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

`orderGate.verify` asks `canCarryStopLoss(caps)` unconditionally. `caps` come
from the active exchange, and the gate is designed to run identically for live
and paper (`tradeService.ts:458` — "Live and paper differ here and nowhere
else"). The stop capability is the one question that does **not** survive that
identity: in paper mode the request stops at the paper seam and
`paperExchange` carries the plan in its own simulated book, so no venue
capability applies.

## Fix

Exempt a paper order from the stop-capability refusal in the gate, and keep the
panel's warning in step so the UI stops describing a refusal that no longer
happens. Live trading is unchanged.

Leave alone: the live Bitget refusal (still correct — the venue genuinely cannot
carry the stop), TP/SL placement modes, the paper simulator itself.

## Acceptance criteria

- [x] A test reproduces the defect and fails without the fix — paper entry on
      Bitget carrying a stop is refused as `unplaceableStop` (proven RED 2026-10-11)
- [x] A paper entry may carry a stop on any venue; no outbound request is
      possible (paper seam is unchanged)
- [x] A live Bitget entry with a stop is still refused as `unplaceableStop`
- [x] The trade panel shows no "unplaceable stop" warning in paper mode, and
      still shows it live
- [x] Tests pass with the fix (44/44 gate, 111/111 results components)
- [x] German and English strings for any touched UI — none added, no new copy

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