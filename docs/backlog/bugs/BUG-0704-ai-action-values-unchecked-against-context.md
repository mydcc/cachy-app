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
- **Action values are parsed with `parseAiValue`** — the same parser
  `executeAction` uses. `validateAiAction` accepts a `k`/`m` suffix and the
  executor scales it, so a check with a different parser would verify
  `81859.7` and write `81859700`. This is the parser-parity rule, and it has a
  test.
- **Only real levels are candidates.** An explicit `PRICE_PATHS` list names
  `REAL_TIME_PRICE`, `marketDetails.{currentPrice,high24h,low24h}`,
  `orderbook.{topBids,topAsks}[]`, `technicals.movingAverages[].value`,
  `technicals.pivots.classic.*`, `technicals.divergences[].{priceStart,priceEnd}`,
  `tradeSetup.{entry,sl,tp[].price}` and `openPositions[].entry`. Walking every
  number instead let `volume24h` (21622.5 on BTC), an RSI of 44.53 on a $50
  asset, a confluence score or a take-profit percentage vouch for an invented
  price — each has a regression test.
- **No magnitude band.** Because the candidate set is now price-only, a limit
  entry at `10000` while the live price is `80000`, and an old position opened
  far away, are legitimate context levels and must not be flagged.
- **A context without prices is reported, not silent.** `checkActionPrices`
  returns `{ unverified, checked }`; `checked: false` means the batch carries a
  price but the context carried none (a gather timeout, a missing ticker). The
  block then says the prices could not be checked — silence must not read as
  "verified".
- **The request-local context is used**, not `this.lastContext`: a second send
  can overwrite the shared field before this stream's actions run.
- `AI_PRICE_ACTIONS` lives in `actionPolicy.ts` next to the catalog; a test
  asserts every id is a known catalog action and requires confirmation, so a
  future price action cannot silently skip the guard.
- `AssistantView.svelte` renders `UnverifiedPriceWarning.svelte` (new): one
  warning per batch, one list entry per value (`70000 (TP 2)`), `role="status"`
  so a screen reader hears it, and a neutral line for the unchecked state.
  Nothing is dropped or rewritten — the user still decides.

The guard is informational by construction: every price action is a catalog
action, and `requiresConfirmation` excludes only notes and tags, so a price
batch always stops at the confirmation block before anything is applied.

## Verification

- `src/lib/ai/actionContextCheck.test.ts` — **18 cases**: exact level,
  2-decimal rounding, live price, 24h high, pivot, order-book bid, invented but
  plausible level, sub-cent collapse, volume, RSI on a $50 asset, take-profit
  percentage, distant limit entry and open-position entry, `addTakeProfit`, the
  take-profit index in the verdict, relative tolerance, the exact 0.1 %
  boundary (`100100` accepted, `100101` flagged), `k`/`m` parser parity,
  technicals-only context without a live price, missing/empty context →
  `checked: false`, price-less batch → `checked: true`, and the catalog
  invariant.
- `src/stores/ai.actionContext.test.ts` — **6 cases** through the real send
  path: invented entry flagged, live price unflagged, one invented target flags
  the batch, `81859.7k` flagged (the executor would write 81 859 700), the
  flagged value stays in the batch and `confirmAction` applies it to
  `tradeState.entryPrice`, and a note-only batch stays unflagged and checked.
- `src/lib/windows/implementations/UnverifiedPriceWarning.component.test.ts` —
  **3 cases**: both entries with `(TP 2)`, the unchecked line, and no markup at
  all when everything matched.
- Four mutations were each caught: parsing without the `k`/`m` multiplier,
  collecting every scalar instead of the price paths, an exclusive tolerance
  boundary, and dropping the target index from the warning.

Targeted run: **55 tests in 5 files** (unit, including the action-policy and
provider-failure suites) plus **3 component tests**. `eslint` clean,
`svelte-check` no findings for the touched files, `npm run backlog:check` 576
items valid, `validate-i18n.js` all keys present, `schema.d.ts` regenerated
(3957 keys).

Not covered: the store's `pricesUnchecked` flag is not driven end-to-end — a
gather timeout needs a five-second race, so the pure test covers
`checked: false` and the component test covers its rendering. The component
test does not mount `AssistantView` itself; that view has no harness
(`AssistantView.test.ts` covers the provider gate only).

## Out of scope

Changing the prompt further, and any automatic correction of a model value —
the user still decides what is written into the form. `addTakeProfit` on a full
setup still overwrites the last target (BUG-0705, filed separately).
