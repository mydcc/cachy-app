---
id: FEAT-0368
title: Batch or debounce synchronous AlertEngine evaluation on high-frequency price updates
type: feature
status: dropped
priority: P2
milestone: none
editions: [community, pro, private]
area: alerts
data_class: none
adr: none
depends_on: []
size: S
---

# FEAT-0368 — Batch or debounce synchronous AlertEngine evaluation on high-frequency price updates

## Problem

In `src/stores/market/applyUpdate.ts:51-57`, incoming price ticks execute `alertEngine.evaluate` synchronously on the hot path:

```typescript
if (hasNewPrice) {
    alertEngine.evaluate(symbol, newVal.toString(), Date.now());
}
```

When multiple symbols are actively streaming WebSocket trades or tickers at dozens of messages per second, calling WASM-backed `alertEngine.evaluate` on every individual price tick introduces synchronous overhead to the WebSocket ingestion pipeline. If no active alerts exist for a given symbol, evaluating every tick remains wasted work.

## Proposal

1. Add a quick symbol existence guard: if `alertEngine.hasActiveAlertsForSymbol(symbol)` is false, bypass evaluation immediately without converting numbers to strings or calling WASM.
2. For symbols with active alerts, batch evaluations or throttle them to at most once per 100–250ms per symbol.
3. This ensures fast ingestion of market data while preserving near-instant alert triggering when target thresholds are crossed.

## Evaluation

- **Umfang (Scope):** S (approx. 20 lines across `alertEngine.ts` and `applyUpdate.ts`)
- **Priorität (Priority):** P2 (Protects WS ingestion throughput during high market volatility)
- **Schwierigkeit (Difficulty):** Medium
- **Dringlichkeit (Urgency):** Low

## Acceptance criteria

- [ ] Symbols without active alerts incur zero evaluation overhead during price ingestion.
- [ ] Active alerts continue to trigger promptly when price crosses target boundaries.
- [ ] WebSocket message processing latency does not degrade during high-volume market surges.

## Out of scope

- Modifying alert notification mechanisms (audio, toasts, browser notifications).

## Open questions

None.

## Links

- `src/stores/market/applyUpdate.ts:51-57`
- `src/services/alertEngine/alertEngine.ts:113-126`

## Closed as superseded (2026-09-12)

[`FEAT-0387`](FEAT-0387-expose-rule-evaluator.md) is `done` and
[`FEAT-0388`](FEAT-0388-migrate-alerts-to-rule-documents.md) with it. The reconcile
clause below reserved one escape hatch — keep the smaller fix *only* if a **measurable**
cost remains on the legacy tick path. It was measured. It does not.

### What the legacy tick path actually costs

Throwaway bench (not a repo artefact) over the committed `static/wasm` artefact,
median of 7-9 interleaved rounds of 50 000 `AlertEngineWasm.evaluate` calls, first two
rounds dropped as warmup, alert targets unreachable so no firing path is measured.
Ticks round-robin across the symbols, which is the shape that matters: `evaluate`
scans the whole alert `Vec` on every call, so cost grows with *total* alerts, not with
the ticking symbol's own.

| symbols | alerts | µs/tick | @500 ticks/s aggregate | throttled to 250 ms/symbol |
|---|---|---|---|---|
| — | 0 | ~2.5 | 1.24 ms/s (0.12%) | — |
| 1 | 1 | 1.21 | 0.60 ms/s (0.06%) | ~0 |
| 10 | 10 | 1.35 | 0.68 ms/s (0.07%) | 0.05 ms/s |
| 20 | 50 | 1.95 | 0.97 ms/s (0.10%) | 0.16 ms/s |
| 20 | 200 | 4.47 | 2.24 ms/s (0.22%) | 0.36 ms/s |
| 50 | 500 | 10.03 | 5.02 ms/s (0.50%) | 2.01 ms/s |

500 ticks/s aggregate is already an aggressive read of "dozens of messages per second"
across a watchlist. At the extreme end — 500 alerts over 50 symbols — the whole hot
path costs **0.5% of one core**, and the proposed throttle would recover 3 ms/s of
that. There is no ingestion-latency problem here to protect: a 10 µs synchronous call
cannot delay a WebSocket message pipeline in any way a trader can observe, and it
cannot drop a frame.

For scale, `FEAT-0387` measured its own replacement path at 82 ms per close for 500
rules and accepted that as 0.14% of a candle period. This item's target is an order of
magnitude cheaper than the thing that replaced it.

### Both halves of the proposal are unsafe as written

Proposal 1, the symbol guard, is not behaviour-neutral, because `AlertEngine::evaluate`
is a **cross detector** whose `last_prices` baseline is seeded *only* by `evaluate`
itself (`technicals-wasm/src/alert_engine.rs`). Skipping the call for a symbol with no
active alerts freezes that baseline. Verified against the committed wasm:

- **Spurious fire.** Baseline frozen at 60 000 when the last alert was removed; price
  drifts to 61 000 while the guard skips; the trader now arms *cross up 60 500* with
  price already above it. Next tick fires immediately. Without the guard the same
  sequence correctly does not fire.
- **Permanently lost cross.** With no baseline at all, `PriceCrossUp`/`PriceCrossDown`
  cannot fire on the first tick — and since that tick seeds the baseline *above* the
  target, the cross is lost for good, not merely delayed. `alert.active` stays `true`
  and the alarm waits for a cross that already happened.

A safe guard is buildable (prime the baseline with one `evaluate` before the alert set
reaches WASM, while the engine still holds nothing for that symbol), but that is a
false-fire and missed-fire class introduced into a money path to recover ~1 ms/s.

Proposal 2, the throttle, is baseline-safe — a sustained cross sampled coarsely still
fires, confirmed — but it silently drops a touch-and-recover inside its window. That is
the *same* behaviour change `FEAT-0387` documented to traders as a consequence of
candle-close evaluation, and adding a second, undocumented one at 250 ms for 3 ms/s of
main thread is not a trade this project makes.

### Consequence

Closed as `dropped`, superseded by `FEAT-0387`. The legacy tick path stays exactly as
it is until `FEAT-0406` (rule-loop disarm) and the eventual removal of the legacy
engine take it out entirely. `src/stores/market/applyUpdate.ts` carries a comment
pointing here, so the next reader measuring the same hot path does not re-file it.

Mirror issue #2594 is to be shut as superseded when this lands.

## Reconcile with FEAT-0387 (added 2026-09-04)

[`FEAT-0387`](FEAT-0387-expose-rule-evaluator.md) moves evaluation from every price
tick to once per close of the rule's trigger timeframe. That *is* the debounce this
item asks for, and it removes the hot-path cost rather than smoothing it.

Do not implement both. Whoever picks up either item first decides: if `FEAT-0387`
lands, this item closes as superseded — unless a measurable cost remains on the legacy
tick path before [`FEAT-0388`](FEAT-0388-migrate-alerts-to-rule-documents.md) removes
it, in which case say so here and keep the smaller fix.
