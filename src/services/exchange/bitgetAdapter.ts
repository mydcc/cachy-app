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
 * The trading verbs still delegate to the same `tradeService` as Bitunix,
 * because `tradeService` is already provider-parameterised (`X-Provider`, plus
 * `exchange` in the body) and the proxy routes branch server-side. Verbs the
 * routes refuse for Bitget — TP/SL, see routes/api/tpsl/+server.ts — are
 * refused exactly as they were before FEAT-0016; `supports` states which those
 * are so FEAT-0017 can stop the UI from offering them at all. Turning
 * `supports` into a local guard would be a user-visible behaviour change,
 * which this item's last acceptance criterion rules out.
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
    RequestPriority,
} from "./types";
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

const account: AccountPort = {
    // Funding-rate history is sourced from Bitunix's batch endpoint only
    // (apiService.fetchBitunixFundingRateHistory). Resolving empty keeps the
    // popover that reads this informational rather than turning a missing
    // data source into an error dialog.
    fetchFundingRateHistory: (): Promise<FundingRateHistoryItem[]> => Promise.resolve([]),

    // Delegated unchanged: tradeService returns early for a non-Bitunix
    // provider (leverage/margin mode) or fails its Bitunix response schema
    // and returns (trading pairs). Same outcome as before FEAT-0016.
    fetchLeverageMarginMode: (symbol) => tradeService.fetchLeverageMarginMode(symbol),
    fetchTradingPairInfo: (symbol) => tradeService.fetchTradingPairInfo(symbol),
};

/*
 * The fail-fast seam, deliberately left open (ADR-0007, last alternative).
 *
 * A verb this venue has no verified format for currently travels to the proxy
 * route and is refused there. Refusing it here instead — `if
 * (!bitgetAdapter.supports.tpSl) throw …` at the top of the TP/SL verbs — is
 * the stricter reading, and the one a trading system normally takes —
 * pre-trade control, in the MiFID II RTS 6 sense. It is not taken here because
 * it changes what the user sees, which FEAT-0016's last acceptance criterion
 * rules out. FEAT-0229 does it: reads resolve empty, writes throw.
 */
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
};

export const bitgetAdapter: ExchangeAdapter = {
    id: "bitget",
    capabilities: capabilitiesOf("bitget"),
    streams: { ticker: true, trades: false },
    supports: { tpSl: false, leverageMarginMode: false, tradingPairInfo: false },
    marketData,
    account,
    trading,
};
