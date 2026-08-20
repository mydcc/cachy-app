/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * The exchange boundary — FEAT-0016.
 *
 * Components, stores and calculations import from here and nowhere else for
 * anything exchange-shaped. `src/tests/architecture/exchange_boundary.test.ts`
 * fails the build when they don't.
 */

export { activeExchange, getExchangeAdapter, exchangeAdapters } from "./registry";
export { ExchangeUnsupportedError, isExchangeUnsupportedError } from "./errors";
export type { UnsupportedFeature } from "./errors";

/*
 * The venue-neutral payload shapes, re-exported so a component never has to
 * name `apiService` to type a ticker or a candle.
 */
export type { Ticker24h, Kline, FundingRateHistoryItem } from "../apiService";
export type { TpSlOrder, PlaceOrderParams, ModifyOrderParams } from "../tradeService";

export type {
    ExchangeAdapter,
    ExchangeId,
    MarketDataPort,
    AccountPort,
    TradingPort,
    AdapterStreams,
    TradingSupport,
    TradePrint,
    RequestPriority,
} from "./types";
