---
id: BUG-0628
title: Panel refetch gated on calculator output deadlocks after a failed metadata fetch
type: bug
status: in-progress
branch: fix/meta-refetch-deadlock
priority: P1
milestone: none
editions: [community, pro, private]
area: calculation
data_class: none
adr: none
depends_on: []
assignee: opencode
---

# BUG-0628 — Panel refetch gated on calculator output deadlocks after a failed metadata fetch

## Symptom

After a silently failed `/api/trading-pairs` fetch, the app is permanently
stuck: the calculator shows `Precision for {symbol} is not available — no
orderable size`, the order panel shows `Enter an entry price and a stop to size
a position first`, and the Network tab shows no further `trading-pairs`
request — for either LONG or SHORT. Only a symbol switch (or reload) can
unblock it. Observed live on `dev.cachy.app` with ETHUSDT on Bitunix.

## Evidence

**Demonstrated** (user incident) **and derived** (code). The incident: dual
error messages plus an empty `trading-pairs` filter in the Network tab while
klines for other symbols returned 200.

Two pieces of code disagree:

- `src/services/calculatorService.ts:283` refuses without metadata, so
  `tradeState.currentTradeData` stays `null`.
- `src/components/results/PlaceOrderPanel.svelte:352` refetches only
  `if (data?.symbol && exchange === "bitunix" && !meta)` — keyed off the
  calculator *output* (`data = tradeState.currentTradeData`), which is `null`
  exactly when a refetch is needed.

The only other trigger is `src/services/app.ts:607` (`fetchAllAnalysisData`,
fire-and-forget on symbol change, fails silently). The store already
distinguishes miss states (`marketState.shouldFetchMeta` + 30s
`META_FETCH_RETRY_MS` cooldown in `src/stores/market.svelte.ts`), but nothing
re-invokes the fetch after the cooldown once the calculator has refused.

## Cause

The refetch effect depends on the value the guard it is supposed to repair
produces. A failed first fetch therefore degrades to "no fetch ever again"
instead of "retry after cooldown".

## Fix

Key the panel refetch off the trade *input* (`tradeState.symbol`, falling back
to `data?.symbol`) and re-arm one attempt per cooldown via a local retry tick
with effect cleanup. No change to the refusal itself (BUG-0501 stays intact),
no change to submit gating. `fetchKeyedMeta` keeps deduplicating concurrent
callers, so this cannot become a fetch storm.

## Acceptance criteria

- [ ] A component test mounts the panel with `currentTradeData: null`,
      `tradeState.symbol` set and empty `symbolMeta`, and asserts
      `fetchTradingPairInfo` is called with that symbol
- [ ] The test fails without the fix (no fetch while calculator output is null)
- [ ] Existing `PlaceOrderPanel.*` suites and
      `calculatorService.metaGuards.test.ts` stay green
- [ ] No fetch storm: the cooldown guard in `fetchKeyedMeta` is unchanged and
      the effect returns a timer cleanup

## Links

- BUG-0501 — introduced the refusal this deadlock sits behind
- BUG-0599 — canonical venue-neutral symbol key used by the fix
