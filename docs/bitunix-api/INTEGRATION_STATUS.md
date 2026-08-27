# Bitunix API – Integrationsstatus in Cachy

Abgleich der offiziellen Bitunix-Futures-API (Crawl vom 08.08.2026, siehe
[README.md](README.md)) mit dem tatsächlichen Integrationsstand im Code.
Stand des Abgleichs: **09.08.2026**.

Zweck: Grundlage für die Tradepanel-UI-Überarbeitung und die geplante
Trade-Ausführung (zuerst Bitunix, dann Bitget). Kein Plandokument — was wann
gebaut wird, steht in `docs/MILESTONES.md` / `docs/backlog/`.

**Legende:** ✅ integriert · 🟡 teilweise · ❌ nicht integriert

---

## Architektur-Kurzfassung

Alle Bitunix-REST-Aufrufe laufen über SvelteKit-Proxy-Routen
(`src/routes/api/*`), signiert mit `generateBitunixSignature`
([src/utils/server/bitunix.ts](../../src/utils/server/bitunix.ts)).
Client-seitig kapseln [tradeService](../../src/services/tradeService.ts)
(Trading-Aktionen), [apiService](../../src/services/apiService.ts)
(Marktdaten) und [syncService](../../src/services/syncService.ts)
(Journal-Sync) die Zugriffe. WebSocket:
[bitunixWs.ts](../../src/services/bitunixWs.ts) (public + private inkl.
Login, Reconnect, Resubscribe).

---

## 1. REST-Endpunkte

### Account (`02_account.md`)

| Endpoint | Zweck | Status | Code |
|---|---|---|---|
| `GET /api/v1/futures/account` | Balance, frozen, margin, transfer, positionMode, cross/isolation-UPNL, bonus | ✅ | [routes/api/account](../../src/routes/api/account/+server.ts), [routes/api/balance](../../src/routes/api/balance/+server.ts) |
| `GET …/account/get_leverage_margin_mode` | Hebel & Margin-Mode pro Symbol lesen | ✅ | [routes/api/leverage-margin-mode](../../src/routes/api/leverage-margin-mode/+server.ts) |
| `POST …/account/change_leverage` | Hebel ändern (je Symbol) | ✅ | [routes/api/account-settings](../../src/routes/api/account-settings/+server.ts) |
| `POST …/account/change_margin_mode` | ISOLATION/CROSS; nur ohne offene Position/Order auf dem Symbol | ✅ | [routes/api/account-settings](../../src/routes/api/account-settings/+server.ts) |
| `POST …/account/change_position_mode` | ONE_WAY/HEDGE; nur ohne offene Positionen | ✅ | [routes/api/account-settings](../../src/routes/api/account-settings/+server.ts) |
| `POST …/account/adjust_position_margin` | Margin erhöhen/reduzieren; nur Isolated | ✅ | [routes/api/account-settings](../../src/routes/api/account-settings/+server.ts) |

Hebel, Margin-Mode und Position-Mode sind im Tradepanel änderbar
([ExchangeAccountControls](../../src/components/inputs/ExchangeAccountControls.svelte)),
die Isolated-Margin einer Position über
[AdjustMarginModal](../../src/components/shared/AdjustMarginModal.svelte)
(FEAT-0068). Die dokumentierten Vorbedingungen (Margin-Mode nur ohne
Position/Order auf dem Symbol, Position-Mode nur ohne offene Positionen)
deaktivieren den jeweiligen Button mit Begründung; durchgesetzt werden sie
weiterhin von der Börse.

### Market (`04_market.md`) — public, kein API-Key nötig

| Endpoint | Status | Code / Anmerkung |
|---|---|---|
| `GET …/market/tickers` | ✅ | [routes/api/tickers](../../src/routes/api/tickers/+server.ts) |
| `GET …/market/kline` | ✅ | [routes/api/klines](../../src/routes/api/klines/+server.ts) |
| `GET …/market/funding_rate/batch` | ✅ | [routes/api/funding-rate](../../src/routes/api/funding-rate/+server.ts); Prozent→Bruch-Normalisierung in `apiService.fetchBitunixFundingRates` |
| `GET …/market/funding_rate` (single) | ❌ | Durch Batch abgedeckt — bewusst nicht nötig |
| `GET …/market/get_funding_rate_history` | ❌ | — |
| `GET …/market/depth` (REST) | ❌ | WS `depth_book5` wird stattdessen genutzt |
| `GET …/market/trading_pairs` | ❌ | **Wichtig für Trade-Ausführung**: `basePrecision`/`quotePrecision`, `minTradeVolume`, `maxLimitOrderVolume`/`maxMarketOrderVolume`, `min`/`maxLeverage`, `priceProtectScope`, `symbolStatus`, `isApiSupported` — ohne diese Daten kann das Tradepanel Orders nicht zuverlässig validieren und runden |

### Position (`05_position.md`)

| Endpoint | Status | Code / Anmerkung |
|---|---|---|
| `GET …/position/get_pending_positions` | ✅ | [routes/api/positions](../../src/routes/api/positions/+server.ts), [routes/api/sync/positions-pending](../../src/routes/api/sync/positions-pending/+server.ts) |
| `GET …/position/get_history_positions` | ✅ | [routes/api/sync/positions-history](../../src/routes/api/sync/positions-history/+server.ts) |
| `GET …/position/get_position_tiers` | ❌ | Maintenance-Margin-Stufen → präzisere Liquidationspreis-/Risiko-Berechnung möglich |

### Trade (`07_trade.md`)

| Endpoint | Status | Code / Anmerkung |
|---|---|---|
| `POST …/trade/place_order` | ✅ | [routes/api/orders](../../src/routes/api/orders/+server.ts) (`type: "place-order"`), Client: `tradeService.placeOrder()`. Gesendet: `symbol`, `side`, `orderType`, `qty`, `price`, `reduceOnly`, `tradeSide`/`positionId` (Hedge), `triggerPrice`, sowie seit FEAT-0069 `tpPrice`/`tpStopType`/`tpOrderType`/`tpOrderPrice`, die `sl*`-Gegenstücke, `effect` (nur bei LIMIT) und `clientId` (eine ID pro Sendeversuch, bei Retry wiederverwendbar) |
| `POST …/trade/cancel_orders` | ✅ | `cancelBitunixOrder` in [routes/api/orders](../../src/routes/api/orders/+server.ts) |
| `POST …/trade/cancel_all_orders` | ❌ | Cachy loopt stattdessen über pending + Einzel-Cancel (`type: "cancel-all"`) — race-anfällig, mehr Rate-Limit-Last |
| `POST …/trade/close_all_position` | ❌ | `tradeService.closeAllPositions()` feuert parallele MARKET-reduceOnly-Orders |
| `POST …/trade/flash_close_position` | ❌ | Cachys „Flash Close" (`tradeService.flashClosePosition`) ist eine MARKET-reduceOnly-`place_order`, nicht der native Endpoint |
| `POST …/trade/modify_order` | ❌ | Offene Order kann nur per cancel + neu platzieren geändert werden |
| `POST …/trade/batch_order` | ❌ | Max. 5 Orders/Request, inkl. TP/SL je Order — interessant für Scale-In/Ladder-Strategien |
| `GET …/trade/get_pending_orders` | ✅ | [routes/api/orders](../../src/routes/api/orders/+server.ts) |
| `GET …/trade/get_history_orders` | ✅ | [routes/api/orders](../../src/routes/api/orders/+server.ts), [routes/api/sync/orders](../../src/routes/api/sync/orders/+server.ts) |
| `GET …/trade/get_history_trades` | ✅ | [routes/api/sync](../../src/routes/api/sync/+server.ts) (Journal) |
| `GET …/trade/get_order_detail` | ✅ | [routes/api/sync/order-detail](../../src/routes/api/sync/order-detail/+server.ts) |

### TP/SL (`06_tp_sl.md`)

| Endpoint | Status | Code / Anmerkung |
|---|---|---|
| `GET …/tpsl/get_pending_orders` | ✅ | [routes/api/tpsl](../../src/routes/api/tpsl/+server.ts) (`action: "pending"`) |
| `GET …/tpsl/get_history_orders` | ✅ | [routes/api/tpsl](../../src/routes/api/tpsl/+server.ts) (`action: "history"`) |
| `POST …/tpsl/cancel_order` | ✅ | [routes/api/tpsl](../../src/routes/api/tpsl/+server.ts) (`action: "cancel"`) |
| `POST …/tpsl/modify_order` | ✅ | [routes/api/tpsl](../../src/routes/api/tpsl/+server.ts) (`action: "modify"`); UI: [TpSlEditModal](../../src/components/shared/TpSlEditModal.svelte). Wire format fixed in BUG-0293 — it previously sent `{symbol, planType, triggerPrice}`, a shape this endpoint does not document. |
| `POST …/tpsl/place_order` | ✅ | FEAT-0070: [routes/api/tpsl](../../src/routes/api/tpsl/+server.ts) (`action: "place"`); UI: [TpSlCreateModal](../../src/components/shared/TpSlCreateModal.svelte) (partial section) |
| `POST …/tpsl/position/place_order` | ✅ | FEAT-0070: [routes/api/tpsl](../../src/routes/api/tpsl/+server.ts) (`action: "place-position"`); UI: [TpSlCreateModal](../../src/components/shared/TpSlCreateModal.svelte) (position-wide section) |
| `POST …/tpsl/position/modify_order` | ❌ | Adding a missing leg to an existing position-wide plan; not wired. `TpSlCreateModal` routes an already-covered leg to the single-leg `TpSlEditModal` instead, which uses `tpsl/modify_order`. |

### Sonstiges

- **Plan-Orders (Trigger-Orders):** `GET /api/v1/futures/plan/get_history_plan_orders`
  wird im Journal-Sync genutzt
  ([routes/api/sync/orders](../../src/routes/api/sync/orders/+server.ts)),
  aber die restliche Plan-Order-Familie (place/cancel/get_pending) **fehlt im
  Doku-Crawl** unter `docs/bitunix-api/`. TODO: beim nächsten Crawl ergänzen.
- **CopyTrading** (`03_copytrading.md`): Asset-Query + Sub-Account-Transfers —
  nicht integriert, derzeit out of scope.

---

## 2. WebSocket-Channels (`08_websocket.md`)

| Channel | Typ | Status | Anmerkung |
|---|---|---|---|
| `price` (MarketPrice: Mark/Index, Funding) | public | ✅ | |
| `ticker` (24h, einzeln) | public | ✅ | |
| `tickers` (Batch, inkl. Best-Bid/Ask `bd`/`ak`/`bv`/`av`) | public | ❌ | Best-Bid/Ask wäre fürs Tradepanel nützlich (Spread-Anzeige, Market-Order-Schätzung) |
| `depth_book5` | public | ✅ | `books`/`book1`/`book15` ungenutzt |
| `market_kline_*`, `mark_kline_1day` | public | ✅ | Inkl. synthetischer Timeframes via `BROKER_CAPABILITIES` |
| `trade` (public Trades) | public | ✅ | |
| `order` | private | ✅ | |
| `position` | private | ✅ | |
| `wallet` (Balance) | private | ✅ | Felder `expMoney`, `isolationFrozen`, `crossFrozen` werden empfangen, aber nicht angezeigt |
| `tp_sl` (TP/SL-Channel) | private | ✅ | Jedes Bein (TP/SL) kommt als eigener Push, nicht atomar zusammen — `tpSlState.updateFromWs()` aktualisiert pro Bein |

Wichtiger Doku-Hinweis (aus `07_trade.md`/`06_tp_sl.md`): Eine erfolgreiche
REST-Antwort bei order-verändernden Endpoints garantiert **nicht**, dass die
Operation durchging — die WS-Push-Nachricht ist die verlässliche Bestätigung.
Neue Schreib-Endpoints sollten daher wie die bestehenden über das
OMS-/WS-Bestätigungsmuster laufen.

---

## 3. Account-Daten: verfügbar vs. angezeigt

Bereits geholt und angezeigt
([AccountSummary](../../src/components/shared/AccountSummary.svelte) +
`AccountTooltip`): `available`, `margin`, PnL, `frozen`, `transfer`, `bonus`,
`positionMode`, `crossUnrealizedPNL`, `isolationUnrealizedPNL`,
`totalPositionSize` (client-berechnet).

Verfügbar und integriert:

- **Hebel + Margin-Mode je Symbol** (`get_leverage_margin_mode`) — lesend und
  schreibend (FEAT-0068)
- Position-Tiers (Maintenance-Margin-Stufen)
- Trading-Pair-Limits (Präzision, Min-/Max-Ordergrößen, Max-Hebel)
- `expMoney`, `isolationFrozen`, `crossFrozen` aus dem Wallet-Channel

---

## 4. Priorisierte Lücken (Empfehlung)

1. **`trading_pairs`** — Order-Validierung/Präzision; Grundlage für alles Weitere
2. ~~**Account-Settings-Block**~~ — erledigt (FEAT-0068):
   `get_leverage_margin_mode` (lesen) + `change_leverage`,
   `change_margin_mode`, `change_position_mode`, `adjust_position_margin`
   (schreiben). Bitget bleibt offen — kein geprüftes Anfrageformat.
3. ~~**`place_order` vervollständigen**~~ — erledigt (FEAT-0069): `tpPrice`/`slPrice` atomar, `effect`, `clientId`
4. ~~**`tpsl/place_order` + `tpsl/position/place_order`**~~ — erledigt (FEAT-0070): TP/SL nachträglich setzen, position-weit und teilweise
5. **Native Endpoints statt Client-Loops** — `cancel_all_orders`,
   `close_all_position`, `flash_close_position`, `modify_order`
6. ~~**Privater TP/SL-WS-Channel** abonnieren~~ — erledigt: `tp_sl`-Channel
   abonniert, `tpSlState.updateFromWs()` verarbeitet Pushes live statt nur
   per 30s-REST-Cache
7. Nice-to-have: `tickers`-Batch-Channel (Best Bid/Ask), Funding-History,
   Position-Tiers
