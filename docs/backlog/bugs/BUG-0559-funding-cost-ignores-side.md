---
id: BUG-0559
title: Estimated funding cost ignores long and short direction
type: bug
status: done
assignee: opencode
branch: fix/0559-funding-side
priority: P2
milestone: none
editions: [community, pro, private]
area: calculation
data_class: C
adr: none
depends_on: []
---

# BUG-0559 — Estimated funding cost ignores long and short direction

## Symptom

The estimated 24-hour funding cost uses the average rate without applying the planned trade direction. A short shown as paying a positive cost when it would receive funding can reverse a trader’s hold-cost decision.

## Evidence

**Derived.** `src/components/inputs/TradeSetupInputs.svelte:133-162` computes notional multiplied by average seven-day funding rate and settlements per day without reading `tradeState.tradeType`. At `:674-685`, positive values are rendered as cost and negative values as income, with no side correction.

## Cause

The display estimate models the funding rate but not the cash-flow sign associated with long versus short exposure.

## Fix

Apply position side to the funding cash flow, distinguish cost from income in wording and semantic color, and retain visible provenance that the value is an average-rate estimate.

## Acceptance criteria

- [ ] Long and short × positive/negative rate tests produce the correct signed cash flow.
- [ ] Positive cost and negative income use distinct labels and semantic colors.
- [ ] Funding intervals other than eight hours remain exact.
- [ ] The displayed value is explicitly identified as an average-rate estimate.

## Out of scope

- Account-tier-specific future funding predictions.
- Exact settlement-level exchange forecasting.
- Changes to funding-rate data sourcing.

## Links

- `src/components/inputs/TradeSetupInputs.svelte:133-162`
- `src/components/inputs/TradeSetupInputs.svelte:674-685`
- Existing coverage: no backlog item records the missing long/short funding sign.
