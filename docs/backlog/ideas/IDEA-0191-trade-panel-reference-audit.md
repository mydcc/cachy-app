---
id: IDEA-0191
title: Derive the trade-panel UI gap list from the reference screenshots
type: idea
status: done
priority: P3
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: []
start_date: 2026-08-13
target_date: 2026-08-15
size: S
estimate: 2
---


# IDEA-0191 — Derive the trade-panel UI gap list from the reference screenshots

## The thought

Cachy's current UI is complete for what it was: a position-size and risk
calculator. A full trading session (M3) needs more surfaces — order-type
modals, account-mode dialogs, alert management, position analytics — and the
reference for "complete" is the exchange's own UI. A set of reference
screenshots exists for exactly this purpose (currently
`bitunix_screenshot_of_ui_tpmp/` at the repository root; relocation is
[`BUG-0192`](../bugs/BUG-0192-third-party-assets-in-repo.md)'s business).

The work, when picked up:

1. Read the screenshots and inventory every surface, control and data field
   the reference UI offers.
2. Diff that inventory against the existing M3 items (FEAT-0020, FEAT-0021,
   FEAT-0023, FEAT-0024, FEAT-0025, FEAT-0026, FEAT-0057, FEAT-0067–0072) —
   most gaps are already specced.
3. File the genuinely uncovered gaps as new items; do **not** widen existing
   items.

The output is a gap list and new backlog items, not UI work itself.

*Update: The visual analysis has been completed and documented in [IDEA-0199-bitunix-ui-analysis.md](IDEA-0199-bitunix-ui-analysis.md).*

## Why not now

The screenshots are deliberately parked until the M3 build-out starts —
reading them earlier produces a list that goes stale against the M2/M3 specs.

## Links

- [`BUG-0192`](../bugs/BUG-0192-third-party-assets-in-repo.md) — where the
  screenshots should live
- [`FEAT-0057`](../features/FEAT-0057-market-activity-panel-redesign.md) —
  the item that already consumed part of this reference set
- [`MILESTONES.md`](../../MILESTONES.md) — M3

## Implementation record

The implementation was merged on 2026-09-01 in `6b2a0bc8` and shipped in
`1.6.0-beta.197`. It lowered the WASM routing threshold, added the per-settings
instance cache and incremental `shift()` path, replaced Bollinger variance with
Welford's online calculation, and stored SuperTrend's window length in state.
Later routing work may supersede the original threshold decision, but the
performance proposals in this idea are no longer open.
