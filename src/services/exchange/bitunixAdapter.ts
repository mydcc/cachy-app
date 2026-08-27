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
    ConnectionPort,
    MarketDataPort,
    AccountPort,
    TradingPort,
    RequestPriority,
    TradePrint,
} from "./types";
import type { Decimal } from "decimal.js";

/**
 * Bitunix's own channel vocabulary (FEAT-0227). `depth_book5` and `price` go
 * to the wire exactly as spelled here — see `getBitunixChannel` — which is
 * why they must not sit in a file Bitget also reads.
 *
 * Public channels only. `positions` and `orders` are private: the service
 * subscribes to them itself once its authenticated socket has logged in
 * (`subscribePrivate`, which asks for "position"/"order"/"wallet"/"tp_sl").
 * Claiming them here would be the BUG-0001 shape — a subscription the venue
 * accepts and then never delivers on, or worse, delivers twice.
 */
const CHANNELS: Record<string, string[]> = {
    ticker: ["ticker"],
    price: ["price"],
    depth: ["depth_book5"],
};

const connection: ConnectionPort = {
    connect: (force) => bitunixWs.connect(force),
    destroy: () => bitunixWs.destroy(),
};

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

    channelsForRequirement: (requirement) => {
        // Guard against null/undefined or non-strings from JS land.
        if (!requirement || typeof requirement !== "string") return [];
        // Klines are timeframe-specific and pass through as-is.
        if (requirement.startsWith("kline_")) return [requirement];
        // `Object.hasOwn`, not a plain lookup: a bare `CHANNELS[requirement]`
        // also reaches Object.prototype, and "toString" would come back as a
        // function where an array is expected.
        return Object.hasOwn(CHANNELS, requirement) ? CHANNELS[requirement] : [];
    },
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

    changeLeverage: (symbol, leverage) => tradeService.changeLeverage(symbol, leverage),
    changeMarginMode: (symbol, marginMode) => tradeService.changeMarginMode(symbol, marginMode),
    changePositionMode: (positionMode) => tradeService.changePositionMode(positionMode),
    adjustPositionMargin: (params) => tradeService.adjustPositionMargin(params),
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
    supports: {
        tpSl: true,
        leverageMarginMode: true,
        tradingPairInfo: true,
        accountSettings: true,
    },
    connection,
    marketData,
    account,
    trading,
};
