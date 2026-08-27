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
 * Bitunix behind the FEAT-0016 interface.
 *
 * Every method here delegates; none reimplements. That is what makes the
 * change reviewable — the order path's semantics are byte-identical to what
 * they were, and `tradeService`'s public methods still run the FEAT-0011 gate
 * internally, so no call below reaches the exchange unverified.
 */

import { apiService } from "../apiService";
import type { Ticker24h, FundingRateHistoryItem, Kline } from "../apiService";
import { bitunixWs } from "../bitunixWs";
import { tradeService } from "../tradeService";
import type { TpSlOrder, ModifyOrderParams, PlaceOrderParams } from "../tradeService";
import { bitunixCapabilities } from "./bitunixCapabilities";
import { normalizeSymbol } from "../../utils/symbolUtils";
import type {
    ExchangeAdapter,
    MarketDataPort,
    AccountPort,
    TradingPort,
    RequestPriority,
    TradePrint,
} from "./types";
import type { Decimal } from "decimal.js";

const marketData: MarketDataPort = {
    normalizeSymbol: (symbol) => normalizeSymbol(symbol, "bitunix"),

    fetchTicker: (symbol, priority: RequestPriority = "normal", timeout = 10000): Promise<Ticker24h> =>
        apiService.fetchTicker24h(symbol, "bitunix", priority, timeout),

    fetchSnapshot: (priority: RequestPriority = "normal"): Promise<Ticker24h[]> =>
        apiService.fetchMarketSnapshot("bitunix", priority),

    fetchKlines: (
        symbol,
        interval,
        limit = 15,
        startTime,
        endTime,
        priority: RequestPriority = "normal",
        timeout = 10000,
    ): Promise<Kline[]> =>
        apiService.fetchBitunixKlines(symbol, interval, limit, startTime, endTime, priority, timeout),

    subscribe: (symbol, channel) => bitunixWs.subscribe(symbol, channel),
    unsubscribe: (symbol, channel) => bitunixWs.unsubscribe(symbol, channel),

    subscribeTrades: (symbol, onTrade: (trade: TradePrint) => void) =>
        bitunixWs.subscribeTrade(symbol, onTrade),
};

const account: AccountPort = {
    fetchFundingRateHistory: (
        symbol,
        limit = 30,
        priority: RequestPriority = "normal",
    ): Promise<FundingRateHistoryItem[]> =>
        apiService.fetchBitunixFundingRateHistory(symbol, limit, priority),

    fetchLeverageMarginMode: (symbol) => tradeService.fetchLeverageMarginMode(symbol),
    fetchTradingPairInfo: (symbol) => tradeService.fetchTradingPairInfo(symbol),
};

const trading: TradingPort = {
    placeOrder: (params: PlaceOrderParams) => tradeService.placeOrder(params),

    closePosition: (params: {
        symbol: string;
        positionSide: "long" | "short";
        amount?: Decimal;
        forceFullClose?: boolean;
    }) => tradeService.closePosition(params),

    cancelOrder: (symbol, orderId) => tradeService.cancelOrder(symbol, orderId),
    cancelAllOrders: (symbol, throwOnError = false) => tradeService.cancelAllOrders(symbol, throwOnError),
    modifyOrder: (params: ModifyOrderParams) => tradeService.modifyOrder(params),

    fetchTpSlOrders: (view = "pending") => tradeService.fetchTpSlOrders(view),
    cancelTpSlOrder: (order: TpSlOrder) => tradeService.cancelTpSlOrder(order),
    modifyTpSlOrder: (params) => tradeService.modifyTpSlOrder(params),
    placePositionTpSl: (params) => tradeService.placePositionTpSl(params),
    placeTpSlOrder: (params) => tradeService.placeTpSlOrder(params),
};

export const bitunixAdapter: ExchangeAdapter = {
    id: "bitunix",
    capabilities: bitunixCapabilities,
    streams: { ticker: true, trades: true },
    supports: { tpSl: true, leverageMarginMode: true, tradingPairInfo: true },
    marketData,
    account,
    trading,
};
