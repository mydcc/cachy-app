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

---

## How Synthetic Timeframes Work in Cachy

When a user selects a timeframe that Bitunix does not support natively via WebSocket (e.g., `3m` or `2m`), Cachy:
1. Subscribes to the underlying base native timeframe WebSocket feed (e.g., `1m` for `3m`).
2. Continuously aggregates incoming base candles/ticks into the target synthetic timeframe in real-time.
3. Renders live candle updates on the Lightweight Charts view without delay.

This ensures seamless live real-time price updates for custom timeframes while keeping network traffic minimal and CPU usage low.
