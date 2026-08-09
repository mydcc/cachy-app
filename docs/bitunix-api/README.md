# Bitunix Futures OpenAPI – Dokumentation (Crawl)

Diese Dokumentation ist ein vollständiger Crawl der offiziellen Bitunix Futures
OpenAPI-Dokumentation unter:

- Quelle: https://www.bitunix.com/api-docs/futures/common/introduction.html
- Gecrawlt am: 08.08.2026
- Basis-Domain REST API: `https://fapi.bitunix.com`
- Basis-Domain WebSocket: `wss://fapi.bitunix.com/public/` (öffentlich) und
  `wss://fapi.bitunix.com/private/` (privat)
- Offizielles Demo-Repo: https://github.com/BitunixOfficial/open-api

## Dateiübersicht

| Datei | Inhalt |
|---|---|
| `00_common.md` | Einführung, Auth-Header, Interaktionsmodell, Standards |
| `01_sign.md` | REST- & WebSocket-Signaturverfahren (inkl. Go/Python-Code) |
| `02_account.md` | Account-Endpunkte (Leverage, Margin, Position Mode, Balance) |
| `03_copytrading.md` | CopyTrading Asset-Endpunkte (Sub-Account-Transfers) |
| `04_market.md` | Market-Daten (Depth, Funding Rate, Kline, Ticker, Trading Pairs) |
| `05_position.md` | Positions-Endpunkte (History, Pending, Tiers) |
| `06_tp_sl.md` | Take-Profit/Stop-Loss-Endpunkte |
| `07_trade.md` | Order-Endpunkte (Place, Modify, Cancel, Batch, History) |
| `08_websocket.md` | WebSocket-Verbindung, Login, alle Private- & Public-Channels |
| `09_error_codes.md` | Vollständige Fehlercode-Tabelle |
| `10_change_log.md` | Änderungsprotokoll der offiziellen Doku |

## Kurzüberblick über die API-Struktur

### Interface-Typen
- **Public**: Keine Authentifizierung nötig (Marktdaten, Konfiguration)
- **Private**: Erfordert Signatur via `api-key`, `nonce`, `timestamp`, `sign`

### Pflicht-Header für alle REST-Requests
| Header | Beschreibung |
|---|---|
| `api-key` | API-Key des Requests |
| `nonce` | Zufälliger 32-Bit-String |
| `timestamp` | Aktueller Timestamp in Millisekunden |
| `sign` | Signatur-String (siehe `01_sign.md`) |
| `Content-Type` | Immer `application/json` |

### Grundlegendes Signaturverfahren (REST)
```
digest = SHA256(nonce + timestamp + api-key + queryParams + body)
sign   = SHA256(digest + secretKey)
```

### HTTP-Statuscodes
- `200` – Erfolg (auch bei Business-Fehlern; siehe `errorCode` im Body)
- `400` – Bad Request
- `403` – Forbidden
- `404` – Not Found
- `500` – Internal Server Error

## Endpunkt-Übersicht (Kurzreferenz)

### Account
- `POST /api/v1/futures/account/adjust_position_margin`
- `POST /api/v1/futures/account/change_leverage`
- `POST /api/v1/futures/account/change_margin_mode`
- `POST /api/v1/futures/account/change_position_mode`
- `GET  /api/v1/futures/account/get_leverage_margin_mode`
- `GET  /api/v1/futures/account`

### CopyTrading
- `GET  /api/v1/cp/asset/query`
- `POST /api/v1/cp/asset/transfer-to-sub-account`
- `POST /api/v1/cp/asset/transfer-to-main-account`

### Market
- `GET /api/v1/futures/market/depth`
- `GET /api/v1/futures/market/funding_rate/batch`
- `GET /api/v1/futures/market/get_funding_rate_history`
- `GET /api/v1/futures/market/funding_rate`
- `GET /api/v1/futures/market/kline`
- `GET /api/v1/futures/market/tickers`
- `GET /api/v1/futures/market/trading_pairs`

**Funding Rate (siehe `04_market.md` für vollständiges Schema):** die Docs
beschreiben `fundingRate` als Bruch (Beispiel `"0.0005"`), Live-Wire-Daten
bestätigen aber, dass Bitunix es tatsächlich bereits als **Prozentwert**
zurückgibt (z. B. `"-0.005776"` entsprach live `-0.0057 %` bei Bitunix, nicht
`-0.5776 %`). Cachy normalisiert das bei der Ingestion in
`apiService.fetchBitunixFundingRates()` — siehe Kommentar dort. Außerdem
enthält der Batch-Endpoint auch coin-/USDC-margined Varianten (`BTCUSD`,
`BTCUSDC`, …), die Cachy nicht braucht; nur `...USDT`-Paare werden verarbeitet.

### Position
- `GET /api/v1/futures/position/get_history_positions`
- `GET /api/v1/futures/position/get_pending_positions`
- `GET /api/v1/futures/position/get_position_tiers`

### TP/SL
- `POST /api/v1/futures/tpsl/cancel_order`
- `GET  /api/v1/futures/tpsl/get_history_orders`
- `GET  /api/v1/futures/tpsl/get_pending_orders`
- `POST /api/v1/futures/tpsl/position/modify_order`
- `POST /api/v1/futures/tpsl/modify_order`
- `POST /api/v1/futures/tpsl/position/place_order`
- `POST /api/v1/futures/tpsl/place_order`

### Trade
- `POST /api/v1/futures/trade/batch_order`
- `POST /api/v1/futures/trade/cancel_all_orders`
- `POST /api/v1/futures/trade/cancel_orders`
- `POST /api/v1/futures/trade/close_all_position`
- `POST /api/v1/futures/trade/flash_close_position`
- `GET  /api/v1/futures/trade/get_history_orders`
- `GET  /api/v1/futures/trade/get_history_trades`
- `GET  /api/v1/futures/trade/get_order_detail`
- `GET  /api/v1/futures/trade/get_pending_orders`
- `POST /api/v1/futures/trade/modify_order`
- `POST /api/v1/futures/trade/place_order`

### WebSocket – Private Channels
- Balance Channel
- Order Channel
- Position Channel
- Tp Sl Channel

### WebSocket – Public Channels
- Depth Channel (`depth_books`, `depth_book1`, `depth_book5`, `depth_book15`)
- Kline Channel (`market_kline_*`, `mark_kline_*`)
- MarketPrice Channel (`price`) — `fr` field is documented as "Funding Rate"
  without a stated scale; live data suggests it's a percentage like the REST
  `fundingRate` field above, not the fraction its own doc example implies.
- Ticker Channel (`ticker`)
- Tickers Channel (`tickers`)
- Trade Channel (`trade`)

---

**For:** Cachy App - Trade Execution Integration
**File:** `docs/bitunix-api/README.md`
