---
id: FEAT-0368
title: Batch or debounce synchronous AlertEngine evaluation on high-frequency price updates
type: feature
status: ready
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

## Reconcile with FEAT-0387 (added 2026-09-04)

[`FEAT-0387`](FEAT-0387-expose-rule-evaluator.md) moves evaluation from every price
tick to once per close of the rule's trigger timeframe. That *is* the debounce this
item asks for, and it removes the hot-path cost rather than smoothing it.

Do not implement both. Whoever picks up either item first decides: if `FEAT-0387`
lands, this item closes as superseded — unless a measurable cost remains on the legacy
tick path before [`FEAT-0388`](FEAT-0388-migrate-alerts-to-rule-documents.md) removes
it, in which case say so here and keep the smaller fix.
