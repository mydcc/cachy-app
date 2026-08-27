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
 * defence; FEAT-0017 added the first by not offering the control, via
 * `bitgetCapabilities` below.
 *
 * Two declarations, two questions. `SUPPORTS` answers "has Cachy wired this
 * verb end-to-end here", `capabilities` answers "what will the venue take on
 * an order". They are deliberately separate — Bitget genuinely accepts
 * attached TP/SL, and Cachy still declares `tpSlAtEntry: false`, because it
 * has no verified wire format for it.
 */

import { apiService } from "../apiService";
import type { Ticker24h, FundingRateHistoryItem, Kline } from "../apiService";
import { bitgetWs } from "../bitgetWs";
import { tradeService } from "../tradeService";
import type { TpSlOrder, ModifyOrderParams, PlaceOrderParams } from "../tradeService";
import { bitgetCapabilities } from "./bitgetCapabilities";
import { normalizeSymbol } from "../../utils/symbolUtils";
import { logger } from "../logger";
import type {
    ExchangeAdapter,
    ConnectionPort,
    MarketDataPort,
    AccountPort,
    TradingPort,
    TradingSupport,
    RequestPriority,
} from "./types";
import { ExchangeUnsupportedError } from "./errors";
import type { Decimal } from "decimal.js";

/**
 * Bitget's own channel vocabulary (FEAT-0227). Narrower than Bitunix's, and
 * the gaps are declared rather than guessed:
 *
 *   - `depth` is `books5` here, not Bitunix's `depth_book5`. One shared table
 *     handing Bitunix's spelling to both venues is what FEAT-0227 came to
 *     remove.
 *   - `price` is absent. Bitget has no separate price channel — the ticker
 *     carries it — and `getBitgetChannel` drops the name, so claiming it here
 *     would open a subscription that never delivers. That is the BUG-0001
 *     failure mode, and an empty array is the honest answer.
 *   - `positions` and `orders` are absent although `getBitgetChannel` accepts
 *     both. They are private channels, and `subscribePrivate` already asks
 *     for them with `instId: "default"` once the socket has logged in.
 *     Mapping them here would add a second, per-symbol subscription over the
 *     top, and every position update would arrive — and be applied — twice.
 */
const CHANNELS: Record<string, string[]> = {
    ticker: ["ticker"],
    depth: ["books5"],
};

const connection: ConnectionPort = {
    connect: (force) => bitgetWs.connect(force),
    destroy: () => bitgetWs.destroy(),
};

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

    channelsForRequirement: (requirement) => {
        if (!requirement || typeof requirement !== "string") return [];
        if (requirement.startsWith("kline_")) return [requirement];
        // `Object.hasOwn`, not a plain lookup — see the Bitunix adapter.
        return Object.hasOwn(CHANNELS, requirement) ? CHANNELS[requirement] : [];
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
    // Bitget has these endpoints; Cachy has no verified request format for
    // them (FEAT-0068 keeps them out of scope until the M2 adapter shape
    // exists). Declared false so the write is refused here rather than being
    // built against a guessed wire format.
    accountSettings: false,
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

    // Writes (FEAT-0068), so they refuse rather than resolve. A margin
    // top-up that quietly did nothing would leave a trader believing their
    // liquidation price had moved away from them.
    changeLeverage: async (symbol, leverage) =>
        SUPPORTS.accountSettings
            ? tradeService.changeLeverage(symbol, leverage)
            : refuse("accountSettings", "changeLeverage"),
    changeMarginMode: async (symbol, marginMode) =>
        SUPPORTS.accountSettings
            ? tradeService.changeMarginMode(symbol, marginMode)
            : refuse("accountSettings", "changeMarginMode"),
    changePositionMode: async (positionMode) =>
        SUPPORTS.accountSettings
            ? tradeService.changePositionMode(positionMode)
            : refuse("accountSettings", "changePositionMode"),
    adjustPositionMargin: async (params) =>
        SUPPORTS.accountSettings
            ? tradeService.adjustPositionMargin(params)
            : refuse("accountSettings", "adjustPositionMargin"),
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
    capabilities: bitgetCapabilities,
    streams: { ticker: true, trades: false },
    supports: SUPPORTS,
    connection,
    marketData,
    account,
    trading,
};
