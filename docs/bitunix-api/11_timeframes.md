# Bitunix API – Timeframes & Intervall-Dokumentation

Diese Übersicht beschreibt die von der Bitunix Futures API unterstützten Timeframes (Intervalle) für REST-Abfragen (`GET /api/v1/futures/market/kline`) und WebSocket-Subscriptions (`market_kline_*`), sowie die Funktionsweise synthetischer Timeframes in Cachy.

---

## 1. Verfügbare Native Bitunix Timeframes

Bitunix bietet nativ folgende K-Line-Intervalle über REST und WebSocket an:

| Intervall (Cachy/UI) | Bitunix REST `interval` | Bitunix WS `ch` Channel | Beschreibung |
|----------------------|-------------------------|--------------------------|--------------|
| `1m`                 | `1m`                    | `market_kline_1min`      | 1 Minute     |
| `5m`                 | `5m`                    | `market_kline_5min`      | 5 Minuten    |
| `15m`                | `15m`                   | `market_kline_15min`     | 15 Minuten   |
| `30m`                | `30m`                   | `market_kline_30min`     | 30 Minuten   |
| `1h`                 | `1h`                    | `market_kline_60min`     | 1 Stunde     |
| `2h`                 | `2h`                    | *(Synthetisch via 1h)*   | 2 Stunden    |
| `4h`                 | `4h`                    | `market_kline_4h`        | 4 Stunden    |
| `6h`                 | `6h`                    | *(Synthetisch via 1h)*   | 6 Stunden    |
| `8h`                 | `8h`                    | *(Synthetisch via 1h)*   | 8 Stunden    |
| `12h`                | `12h`                   | *(Synthetisch via 1h)*   | 12 Stunden   |
| `1d`                 | `1d`                    | `market_kline_1day`      | 1 Tag        |
| `3d`                 | `3d`                    | *(Synthetisch via 1d)*   | 3 Tage       |
| `1w`                 | `1w`                    | `market_kline_1week`     | 1 Woche      |
| `1M`                 | `1M`                    | `market_kline_1month`    | 1 Monat      |

*Hinweis:* Bitunix bietet in der Futures API **keinen** nativen `3m`-Intervall an.

---

## 2. Synthetische Timeframes in Cachy

Nicht von Bitunix nativ angebotene Timeframes (z. B. `2m`, `3m`, `6m`, `9m`, `10m`, `12m`, `24m`, `27m`, `45m`) werden von Cachy dynamisch berechnet (*synthetic timeframes*):

1. **Basis-Stream Abonnements:** Cachy abonniert automatisch den nächstkleineren echten Teiler-Intervall (z. B. `1m` für `3m`, `2m`, `5m` usw.).
2. **Aggregierung im Client:** Die Kerzen (Open, High, Low, Close, Volume) werden im Speicher in Echtzeit aus den eingehenden Basis-Kerzen zusammengefasst.
3. **Performance-Auswirkungen:**
   - **Netzwerk:** Es muss nur der Basis-Stream (z. B. `1m`) übertragen werden.
   - **CPU/Speicher:** Minimale zusätzliche Rechenlast im Web Worker bzw. Client-Store, da nur wenige Kerzen im Puffer aggregiert werden.
   - **Latenz:** Absolut vernachlässigbar (< 1 ms), da die Aggregation synchron beim Eintreffen der WebSocket-Ticks erfolgt.
