---
id: BUG-0795
title: The market store raises a false data-gap toast when the tab is backgrounded
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
assignee: opencode
branch: fix/alert-gap-signal
shipped: PR #4523
---

# BUG-0795 — "Market Data Gap Detected" is a flush-cadence alarm, not a data gap

## Symptom

Switching away from Cachy and returning to the tab produces a red toast:

> Marktdaten-Lücke erkannt. Alarme haben möglicherweise Zwischenpreise verpasst.

Nothing is wrong with the market data at that point. The message arrives after
an ordinary tab switch, it names a consequence ("alerts may have missed
intermediate prices") that no longer applies, and it is marked as an error even
though the app already handled the actual condition — the WebSocket reconnect
introduced by BUG-0217.

## Evidence

Demonstrated. The toast was raised by `MarketManager.flushUpdates()`
(`src/stores/market.svelte.ts:292-303` before this change; abridged below — the
real block also resolved the translator and swallowed the import failure):

```ts
if (this.pendingUpdates.size > 0 || this.pendingKlineUpdates.size > 0) {
  const now = Date.now();
  if (this.lastFlushTime && now - this.lastFlushTime > 10000) {
    import('../services/toastService.svelte').then(m => {
      m.toastService.error(t("dashboard.alerts.gapDetected"));
    });
  }
  this.lastFlushTime = now;
}
```

The flush timer runs every 250 ms (`market.svelte.ts:163`). A hidden tab
throttles it to roughly once a second, then once a minute after five minutes,
and may freeze the page outright; `ConnectionManager` additionally forces a
provider reconnect when a tab returns after 15 s hidden
(`HIDDEN_RECONNECT_THRESHOLD_MS`, BUG-0217). Either path leaves a >10 s hole
between two flushes, and the first kline flush after the return raises the
toast. The toast can be created while the tab is hidden and only become visible
on return, because the 5 s dismissal timer of `toastService` is throttled too.

A regression test now pins the store to stay silent: it flushes one kline batch
through the real path, asserts the close actually landed (so an early return
cannot make the test vacuous) and that `toastService.error` was not called.
Against the old code it fails with exactly `dashboard.alerts.gapDetected`.

## Cause

Three separate defects in one block:

1. **It measured flush cadence, not data.** `lastFlushTime` is store-global, not
   per-series: it is only written by a flush that carried klines, and any other
   symbol's flush refreshes it. Its age therefore says nothing about a
   particular series — a first candle after a globally quiet window looks like a
   gap even when nothing was missed.
2. **The condition is half dead.** The check runs after
   `pendingUpdates.clear()` (`market.svelte.ts:288-289`), so
   `pendingUpdates.size > 0` is always false there. Only a kline flush can
   trigger it, which is why price-only symbols never showed the toast.
3. **The wording is stale.** Since FEAT-0399 nothing evaluates on price ticks
   (`applyUpdate.ts` says so explicitly); alerts run on candle close, and the
   closes a batch *carries* are replayed oldest-first (BUG-0483 part 2). A close
   it does not carry is the hole this change now reports instead of toasting
   about. A real connection loss is signalled by `OfflineBanner`, not by this
   toast.

The toast therefore made a designed, handled reconnect look like a fault, and
described a "missed intermediate prices" path that no longer exists.

## Fix

Two halves, one honest signal:

- Remove the toast and its state (`lastFlushTime`) from `MarketManager`, plus
  the `dashboard.alerts.gapDetected` translation in DE/EN and the regenerated
  `schema.d.ts`.
- Derive a real gap from candle open times instead: `advance()` compares the
  number of periods a batch jumps with the closes it actually delivered. A
  period neither the live stream nor a backfill carried is recorded once per
  `symbol:timeframe` in `RuleEvaluationLoop.seriesGaps()`, mirrored into
  `alertState.seriesGapReport` and rendered as an informational `role="status"`
  banner above the Manage tabs — not a toast, no error styling.
- Only series an armed rule watches are recorded: a hole in a chart nobody
  alerts on is not an alert problem.
- The record is cleared by `reset()` and when the market cache evicts the
  symbol, and both tell the panel, so a re-subscribed series can report a
  genuinely new gap without leaving a stale row behind.

## Acceptance criteria

- [x] A tab switch, a throttled timer or a quiet series no longer raises any
      toast from the market store.
- [x] A regression test fails against the old code with
      `dashboard.alerts.gapDetected` and passes after the removal.
- [x] A candle period that neither the stream nor a batched backfill delivered
      is recorded with symbol, timeframe, last seen open time and the number
      of missing candles.
- [x] A contiguous batch and a batch that carries the intermediate candles
      itself record nothing (the closes are replayed, nothing was missed).
- [x] One record per series until it is evicted; a second gap does not
      re-notify, and a forgotten series leaves no row behind.
- [x] A hole in a series no armed rule watches records nothing.
- [x] The alert panel lists the gap as information and never as `role="alert"`.
- [x] DE/EN translation parity holds and `schema.d.ts` is regenerated.

## Out of scope

- Pausing or reconnecting the WebSocket on visibility change — that is
  BUG-0217 and shipped there.
- Reconstructing a candle the venue never sent. The panel says it is missing;
  it does not guess its OHLC.
- A settings toggle for the banner; it is one line per affected series and
  disappears when the session ends.

## Links

- BUG-0217 — the reconnect that makes the old toast fire on tab return.
- FEAT-0399 — removed per-tick alert evaluation; the wording outlived it.
- BUG-0483 — a batched jump replays every skipped close.
- FEAT-0387 — the rule loop this signal now comes from.
