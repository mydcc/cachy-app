---
id: IDEA-0563
title: Decide what an open with unmeasured balance should do
type: idea
status: idea
priority: P2
milestone: none
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: [BUG-0549]
---

# IDEA-0563 — Decide what an open with unmeasured balance should do

## The thought

Since BUG-0549 the gate refuses an open whose required margin exceeds the
measured balance — but when `displayed.availableMargin` is absent it still
skips the open (the BUG-0511 inheritance: only adds are refused without a
reading). The justification that the risk-derived size check is a second
ceiling only half holds: the size derives from the typed account size
(default 1000), not from the wallet. The state is easy to reach — fresh
load, WS drop, no USDT entry — and today it is invisible: the panel stays
enabled, the gate records no `availableMargin` check, and the first signal
is the venue's reject.

Worst case is a venue reject, not a fund loss, so this is hardening, not a
hole. But the fail-open should become a deliberate, visible decision.

## Options

1. **Refuse** — treat an open like an add when the balance is absent
   (`orderGate.availableMarginUnmeasured`). Cheapest, but costs availability
   on every fresh load until the balance sync lands.
2. **Refresh** — trigger a balance re-read at submit time (the panel already
   re-reads leverage/margin-mode on stale reads) and only skip when the
   refresh fails. Keeps availability, adds latency and a new failure mode.
3. **Audit-visible** — keep the skip, but surface it: panel hint ("balance
   not loaded — venue decides") plus a `checked` entry or refusal reason the
   audit log shows, so the skip is a recorded decision rather than an
   omission.

## Notes

- `checkMargin` documents the skip and the absent-balance fail-open already
  (`src/services/orderGate.ts`, BUG-0549 review); the tests pin it
  (`orderGate.test.ts` asserts `checked` does not contain `availableMargin`
  for the absent case).
- The balance carries no freshness timestamp (leverage has
  `MAX_ACCOUNT_STATE_AGE_MS`); whichever option wins should settle that too.
- Paper mode hydrates the same store, so the decision applies to both modes
  at once.

## Decision

P2, option 3 (audit-visible): the skip stays and is recorded — the gate
pushes `availableMarginUnmeasured` to `checked`, the panel hints that the
venue decides while the balance is unknown. Refusing (option 1) or
refreshing at submit (option 2) stay possible later; neither is needed
because the worst case is a venue reject, never a fund loss.
