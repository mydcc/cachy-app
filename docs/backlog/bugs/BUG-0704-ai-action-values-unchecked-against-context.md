---
id: BUG-0704
title: AI action values are not checked against the context before they reach the trade form
type: bug
status: done
branch: fix/ai-action-context-guard
priority: P2
milestone: none
created: "2026-10-19"
editions: [community, pro, private]
area: ai
data_class: none
adr: none
depends_on: [BUG-0703]
assignee: opencode
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

## Acceptance criteria

- [x] An action price that matches no context value and deviates from the live
      price beyond a stated tolerance is flagged before the user can apply it.
- [x] An exact context value passes without extra friction.
- [x] The tolerance is named and covered by tests.
- [x] Prose-only answers are unaffected.

## Fix

`src/lib/ai/actionContextCheck.ts` (new, pure, store-free) answers one
question: *could the model have read this price from the context it was
handed?*

- `PRICE_MATCH_TOLERANCE = 0.001` — 0.1 %, **relative**, so it holds for BTC
  and for sub-cent assets alike. It sits far above rounding noise (rounding
  `82209.4676` to `82209.47` is 0.000003 %) and far below a magnitude error
  (`0.0123456` → `0.01` is 19 %).
- `PRICE_BAND = 5` — a usable level lies within 5× the live price. This keeps
  percentages and scores in the context (RSI `44.53`, a confluence score of
  `2`) from vouching for a price on a sub-dollar asset, where the magnitudes
  collide.
- Candidates come from `REAL_TIME_PRICE`, `marketDetails`, `technicals`,
  `tradeSetup` and `openPositions`. Portfolio stats, news, history and the
  24 h change are excluded: they cannot be a level.
- A missing or price-less context (a `gatherContext` timeout, for example)
  yields **no** verdicts. An unverifiable value is not evidence of a wrong one,
  and a warning on every action would train the user to click past it.
- Prices are parsed with `toFiniteNumber`, exported from `actionValidation.ts`,
  so the check reads a value exactly the way the validator accepted it.

Wiring:

- `src/stores/ai.svelte.ts` computes the verdict after the permission filter and
  stores it on the batch (`PendingAction.unverifiedPrices`) instead of dropping
  or rewriting anything. A hit is logged.
- `AssistantView.svelte` shows one warning line in the confirmation block
  naming the values (`assistant.unverifiedActionPrices`, DE/EN). The user can
  still apply or ignore the batch.
- The guard is informational by construction: every price action is a catalog
  action, and `requiresConfirmation` excludes only notes and tags, so a price
  batch always stops at the confirmation block before anything is applied.

## Verification

`src/lib/ai/actionContextCheck.test.ts` (11 cases): exact context level,
2-decimal rounding of one, live price, 24 h high/low, an invented level, the
sub-cent collapse, a percentage that must not vouch for a sub-cent price, a
take-profit index that survives into the verdict, the tolerance boundary, a
missing context, and actions that carry no price (leverage, risk, a
percent-only target, notes).

`src/stores/ai.actionContext.test.ts` (4 cases) drives the real send path with a
streamed action block and reads the queued batch back: an invented entry is
flagged, the live price is not, a batch is flagged when only one of its three
prices is invented, and a note-only batch stays unflagged.

Three mutations were each caught: not handing the verdict to the batch, replacing
the tolerance with exact equality (the rounded level then fails), and removing the
magnitude band (the percentage then vouches for `44.53` on a sub-cent asset).

Targeted run: 50 tests in 6 files, including the decimal audit and the
provider-failure suite. `npx eslint` clean, `svelte-check` no findings for the
touched files, `npm run backlog:check` 575 items valid, `validate-i18n.js` all
keys present, `schema.d.ts` regenerated (3956 keys).

Not covered: the warning line's markup has no mount test — `AssistantView` is a
window view without a harness (`AssistantView.test.ts` covers the provider
gate, not the markup). The helper and the batch it feeds are tested; the CSS is
not.

## Out of scope

Changing the prompt further, and any automatic correction of a model value —
the user still decides what is written into the form.
