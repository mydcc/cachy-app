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
 * Bitget behind the FEAT-0016 interface.
 *
 * Narrower than Bitunix, and the gaps are declared rather than papered over:
 * `streams.trades` is false because `getBitgetChannel` has no `trade` entry
 * (bitgetWs.ts) — a trade subscription here would be accepted and then
 * silently dropped, which is precisely the failure BUG-0001 was.
 *
 * Trading verbs the venue does have delegate to the same `tradeService` as
 * Bitunix, which is already provider-parameterised (`X-Provider`, plus
 * `exchange` in the body) with the proxy routes branching server-side.
 *
 * Verbs it does not have are refused here, before a request is built —
 * FEAT-0229, pre-trade control. `SUPPORTS` is the one place that says which
 * those are, and the guards read it, so the declaration cannot drift from the
 * behaviour. Reads resolve empty; writes throw `ExchangeUnsupportedError`.
 * The proxy route (routes/api/tpsl/+server.ts:58) stays as the last line of
 * defence, and FEAT-0017 will add the first by not offering the control.
 */

import { apiService } from "../apiService";
import type { Ticker24h, FundingRateHistoryItem, Kline } from "../apiService";
import { bitgetWs } from "../bitgetWs";
import { tradeService } from "../tradeService";
import type { TpSlOrder, ModifyOrderParams, PlaceOrderParams } from "../tradeService";
import { capabilitiesOf } from "../exchangeCapabilities";
import { normalizeSymbol } from "../../utils/symbolUtils";
import { logger } from "../logger";
import type {
    ExchangeAdapter,
    MarketDataPort,
    AccountPort,
    TradingPort,
    TradingSupport,
    RequestPriority,
} from "./types";
import { ExchangeUnsupportedError } from "./errors";
import type { Decimal } from "decimal.js";

const marketData: MarketDataPort = {
    normalizeSymbol: (symbol) => normalizeSymbol(symbol, "bitget"),

    fetchTicker: (symbol, priority: RequestPriority = "normal", timeout = 10000): Promise<Ticker24h> =>
        apiService.fetchTicker24h(symbol, "bitget", priority, timeout),

    fetchSnapshot: (priority: RequestPriority = "normal"): Promise<Ticker24h[]> =>
        apiService.fetchMarketSnapshot("bitget", priority),

    fetchKlines: (
        symbol,
        interval,
        limit = 15,
        startTime,
        endTime,
        priority: RequestPriority = "normal",
        timeout = 10000,
    ): Promise<Kline[]> =>
        apiService.fetchBitgetKlines(symbol, interval, limit, startTime, endTime, priority, timeout),

    subscribe: (symbol, channel) => bitgetWs.subscribe(symbol, channel),
    unsubscribe: (symbol, channel) => bitgetWs.unsubscribe(symbol, channel),

    // No trade channel is wired for Bitget. Returning a no-op unsubscribe
    // keeps the decorative callers (trade-flow backgrounds) working the way
    // they already do on Bitget — they receive nothing — without opening a
    // subscription that would never deliver.
    subscribeTrades: (symbol) => {
        logger.debug(
            "network",
            `[BitgetAdapter] Trade stream not available; ignoring subscription for ${symbol}`,
        );
        return () => { };
    },
};

/**
 * What this venue has a verified format for. The single source the guards
 * below read, so a flag flipped here changes the refusals with it — a
 * declaration and an implementation that can disagree is worth nothing.
 */
const SUPPORTS: TradingSupport = {
    tpSl: false,
    leverageMarginMode: false,
    tradingPairInfo: false,
};

/**
 * FEAT-0229 — pre-trade control. A write the venue cannot perform is refused
 * here, before a request is built or signed, rather than being sent and
 * refused at the far end. Reads never come through this; they resolve empty.
 */
function refuse(feature: keyof TradingSupport, verb: string): never {
    throw new ExchangeUnsupportedError("bitget", feature, verb);
}

const account: AccountPort = {
    // Funding-rate history is sourced from Bitunix's batch endpoint only
    // (apiService.fetchBitunixFundingRateHistory). Resolving empty keeps the
    // popover that reads this informational rather than turning a missing
    // data source into an error dialog.
    fetchFundingRateHistory: (): Promise<FundingRateHistoryItem[]> => Promise.resolve([]),

    // Reads, so they resolve rather than throw — but they resolve *here*.
    // Both used to travel: `fetchLeverageMarginMode` to be dropped by
    // tradeService's own provider check, `fetchTradingPairInfo` to hit a
    // Bitunix-only route and fail its schema. Neither ever wrote anything on
    // Bitget, so nothing observable changes; what goes is the pointless
    // request.
    fetchLeverageMarginMode: async (symbol) =>
        SUPPORTS.leverageMarginMode
            ? tradeService.fetchLeverageMarginMode(symbol)
            : undefined,
    fetchTradingPairInfo: async (symbol) =>
        SUPPORTS.tradingPairInfo ? tradeService.fetchTradingPairInfo(symbol) : undefined,
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

    // A read: an unsupported venue has no plans to show, and saying so is
    // true. It must not raise a dialog — the position cards call this on
    // every refresh.
    fetchTpSlOrders: async (view = "pending") =>
        SUPPORTS.tpSl ? tradeService.fetchTpSlOrders(view) : [],

    // Writes: these must fail loudly. A cancel or a modify that resolved
    // quietly would leave the trader believing a stop had moved.
    cancelTpSlOrder: async (order: TpSlOrder) =>
        SUPPORTS.tpSl ? tradeService.cancelTpSlOrder(order) : refuse("tpSl", "cancelTpSlOrder"),
    modifyTpSlOrder: async (params) =>
        SUPPORTS.tpSl ? tradeService.modifyTpSlOrder(params) : refuse("tpSl", "modifyTpSlOrder"),
    placePositionTpSl: async (params) =>
        SUPPORTS.tpSl ? tradeService.placePositionTpSl(params) : refuse("tpSl", "placePositionTpSl"),
    placeTpSlOrder: async (params) =>
        SUPPORTS.tpSl ? tradeService.placeTpSlOrder(params) : refuse("tpSl", "placeTpSlOrder"),
};

export const bitgetAdapter: ExchangeAdapter = {
    id: "bitget",
    capabilities: capabilitiesOf("bitget"),
    streams: { ticker: true, trades: false },
    supports: SUPPORTS,
    marketData,
    account,
    trading,
};
