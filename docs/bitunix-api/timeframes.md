# Bitunix API Timeframe Overview & Integration in Cachy

This document summarizes the timeframe intervals supported by Bitunix (REST API and WebSocket streams) and explains how Cachy integrates native vs. synthetic timeframes for real-time charting.

---

## Supported Timeframes Comparison

| Timeframe | REST API (`/api/v1/futures/market/kline`) | WebSocket Channel (`market_kline_*`) | Synthetic in Cachy | Live Real-time Support |
| :--- | :---: | :---: | :---: | :---: |
| **1m** | `1m` | `market_kline_1min` | No (Native) | ✅ Native WS |
| **2m** | ❌ | ❌ | Yes (aggregates 1m) | ✅ Synthetic via 1m WS |
| **3m** | ❌ | ❌ | Yes (aggregates 1m) | ✅ Synthetic via 1m WS |
| **5m** | `5m` | `market_kline_5min` | No (Native) | ✅ Native WS |
| **6m** | ❌ | ❌ | Yes (aggregates 1m) | ✅ Synthetic via 1m WS |
| **9m** | ❌ | ❌ | Yes (aggregates 1m) | ✅ Synthetic via 1m WS |
| **10m** | ❌ | ❌ | Yes (aggregates 1m) | ✅ Synthetic via 1m WS |
| **12m** | ❌ | ❌ | Yes (aggregates 1m) | ✅ Synthetic via 1m WS |
| **15m** | `15m` | `market_kline_15min` | No (Native) | ✅ Native WS |
| **24m** | ❌ | ❌ | Yes (aggregates 1m) | ✅ Synthetic via 1m WS |
| **27m** | ❌ | ❌ | Yes (aggregates 1m) | ✅ Synthetic via 1m WS |
| **30m** | `30m` | `market_kline_30min` | No (Native) | ✅ Native WS |
| **45m** | ❌ | ❌ | Yes (aggregates 1m) | ✅ Synthetic via 1m WS |
| **1h** | `1h` | `market_kline_60min` | No (Native) | ✅ Native WS |
| **2h** | `2h` | ❌ | Yes (aggregates 1h) | ✅ Synthetic via 1h WS / REST |
| **4h** | `4h` | `market_kline_4h` | No (Native) | ✅ Native WS |
| **6h** | `6h` | ❌ | Yes (aggregates 1h) | ✅ Synthetic via 1h WS / REST |
| **8h** | `8h` | ❌ | Yes (aggregates 1h) | ✅ Synthetic via 1h WS / REST |
| **12h** | `12h` | ❌ | Yes (aggregates 1h) | ✅ Synthetic via 1h WS / REST |
| **1d** | `1d` | `market_kline_1day` | No (Native) | ✅ Native WS |
| **3d** | `3d` | ❌ | Yes (aggregates 1d) | ✅ Synthetic via 1d WS / REST |
| **1w** | `1w` | `market_kline_1week` | No (Native) | ✅ Native WS |
| **1M** | `1M` | `market_kline_1month` | No (Native) | ✅ Native WS |

> Reconciliation note: `04_market.md` lists `2h/6h/8h/12h/3d` as native REST intervals and `08_websocket.md` lists `2h/4h/6h/8h/12h/3day` (+ `3min`) as subscribable WS channels. Cachy treats them as synthetic (no map entries in `getBitunixChannel`); the table above is the normative Cachy-native list. If the venue truly serves them natively, add map entries + natives in `brokerCapabilities.ts`.

## Bitget natives (for reference)

Bitget natively serves `1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w` (wire `candle1m…candle1W`, no monthly) — see `brokerCapabilities.ts` and `bitgetWs.ts`. No `docs/bitget-api/` crawl exists; the refusal matrix in `unsupportedVerbs.test.ts` is normative for Bitget.

---

## How Synthetic Timeframes Work in Cachy

When a user selects a timeframe that Bitunix does not support natively via WebSocket (e.g., `3m` or `2m`), Cachy:
1. Subscribes to the underlying base native timeframe WebSocket feed (e.g., `1m` for `3m`).
2. Continuously aggregates incoming base candles/ticks into the target synthetic timeframe in real-time.
3. Renders live candle updates on the Lightweight Charts view without delay.

This ensures seamless live real-time price updates for custom timeframes while keeping network traffic minimal and CPU usage low.
