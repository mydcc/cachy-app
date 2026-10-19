---
id: BUG-0704
title: AI action values are not checked against the context before they reach the trade form
type: bug
status: ready
priority: P2
milestone: none
created: "2026-10-19"
editions: [community, pro, private]
area: ai
data_class: none
adr: none
depends_on: [BUG-0703]
assignee: unassigned
---

# BUG-0704 — A rounded or invented AI price reaches the trade form unchecked

Found during the security review of BUG-0703.

## Symptom

The assistant can emit a JSON action block that writes
`tradeState.entryPrice`, `stopLossPrice` and `targets[idx].price`
(`src/stores/ai.svelte.ts`, `executeAction`). Nothing between the model and the
form compares that value with the context the model was given:

- `src/stores/ai.svelte.ts` `parseActions()` does a raw `JSON.parse` and casts.
- `src/lib/ai/actionValidation.ts` `validateAiAction()` checks the **shape**
  only (`> 0`, `0–100 %`, symbol pattern).
- The only numeric guard is "R:R < 1.5 → force confirmation", computed from the
  model's own numbers.

The prompt now separates "exact for calculations and JSON actions" from "2
decimals in prose" (BUG-0703). That separation is a prompt instruction and
nothing else: a model that rounds anyway, or invents a level, writes it into the
trade form after one confirmation click.

## Why it matters

The value lands in a calculator that manages real money. A rounded sub-cent
price (`0.0123456` → `0.01`) is a 19 % error; an invented level has no bound at
all.

## Proposed fix

In `validateAiAction` (or immediately before `executeAction`), compare each
price-like action value with the context the request used:

- accept an exact match of a context value, or a value within a small tolerance
  of the live price for the symbol;
- reject or flag anything else (`setEntryPrice`, `setStopLoss`,
  `setTakeProfit`);
- carry the outcome into the confirmation UI ("value matches the context" /
  "value is not in the context — check it").

## Acceptance criteria

- [ ] An action price that matches no context value and deviates from the live
      price beyond a stated tolerance is flagged before the user can apply it.
- [ ] An exact context value passes without extra friction.
- [ ] The tolerance is named and covered by tests.
- [ ] Prose-only answers are unaffected.

## Out of scope

Changing the prompt further, and any automatic correction of a model value —
the user still decides what is written into the form.
