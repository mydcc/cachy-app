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
 * FEAT-0016 — one interface every exchange sits behind.
 *
 * The boundary, not the implementation. Each port below delegates to the
 * service that already does the work (`apiService`, `bitunixWs`/`bitgetWs`,
 * `tradeService`); what changes is that components, stores and calculations
 * no longer reach those services directly, so adding a venue stops meaning
 * "touch all of it".
 *
 * FEAT-0227 closed the first of the two gaps this file used to list. The
 * adapter now owns its socket (`connection`) and its channel vocabulary
 * (`channelsForRequirement`); `connectionManager` keeps the session layer it
 * always had — connect / disconnect / provider-switch / tab-visibility, with
 * `switchProvider` still atomic across venues — and drives it through
 * `adapter.connection` rather than through two imported services. Reference
 * counting moved above the adapters into `subscriptionLedger.ts`.
 *
 * Deliberately *not* in here:
 *
 *   - The `src/routes/api/` proxy routes. They already speak one internal
 *     contract (`exchange` in the body, `X-Provider` in the header) and
 *     resolve a venue module server-side (FEAT-0228), which is the
 *     venue-gateway split. A
 *     client adapter cannot be shared with them anyway: it depends on
 *     `settingsState`, `paperExchange` and `orderGate` — Class A browser state.
 */

import type { Decimal } from "decimal.js";
import type { Ticker24h, FundingRateHistoryItem, Kline } from "../apiService";
import type { ExchangeCapabilities } from "./capabilityTypes";
import type { TpSlOrder, ModifyOrderParams, PlaceOrderParams } from "../tradeService";

/** Every venue Cachy can talk to. A third one is FEAT-0016's proof, not its scope. */
export type ExchangeId = "bitunix" | "bitget";

export type RequestPriority = "high" | "normal";

/** One trade print off the public trade stream. */
export interface TradePrint {
    /** Price, as sent — kept as a string so no precision is lost on the way in. */
    p: string;
    /** Quantity. */
    v: string;
    /** Side, venue spelling ("buy"/"sell"). */
    s: string;
    /** Timestamp, ms epoch. */
    t: number;
}

/**
 * What an adapter can do at the transport level, as opposed to what the venue
 * accepts on an order (that is `ExchangeCapabilities`, in `capabilityTypes.ts`).
 *
 * Stated conservatively on purpose: claiming a stream that is not wired up
 * produces a silent dead subscription, which is the failure mode BUG-0001
 * cost a release to find.
 */
export interface AdapterStreams {
    /** Public ticker channel. */
    ticker: boolean;
    /** Public trade-print channel. */
    trades: boolean;
}

/** Prices, candles and the public streams. */
export interface MarketDataPort {
    /** The venue's spelling of a symbol (`BTCUSDT` vs `BTCUSDT_UMCBL`). */
    normalizeSymbol(symbol: string): string;

    fetchTicker(symbol: string, priority?: RequestPriority, timeout?: number): Promise<Ticker24h>;

    /** Every tradable symbol's 24h ticker, one request. */
    fetchSnapshot(priority?: RequestPriority): Promise<Ticker24h[]>;

    fetchKlines(
        symbol: string,
        interval: string,
        limit?: number,
        startTime?: number,
        endTime?: number,
        priority?: RequestPriority,
        timeout?: number,
    ): Promise<Kline[]>;

    /**
     * Subscribe on a public channel (`"ticker"`, `"kline_5m"`, …). Channel
     * names are the internal vocabulary; each adapter maps them to its venue's
     * own (see `getBitunixChannel` / `getBitgetChannel`), and drops one its
     * venue does not have rather than opening a dead subscription.
     *
     * Idempotent, and *not* ref-counted (FEAT-0227): the count lives once in
     * `subscriptionLedger`, above every adapter, because "who wants BTCUSDT"
     * is a consumer question. Calling this twice for the same pair leaves one
     * subscription; calling `unsubscribe` once removes it.
     */
    subscribe(symbol: string, channel: string): void;
    unsubscribe(symbol: string, channel: string): void;

    /**
     * The venue's channel names for one internal data requirement
     * (`"ticker"`, `"depth"`, `"kline_1h"`, …), or an empty array when this
     * venue has none.
     *
     * On the adapter because the answer is venue-specific: `"depth"` is
     * `depth_book5` on Bitunix and `books5` on Bitget. It used to live in
     * `types/dataRequirements.ts`, where one venue's spelling was handed to
     * both — the shared-file half of the problem FEAT-0227 names.
     */
    channelsForRequirement(requirement: string): string[];

    /**
     * Trade prints for one symbol. Returns its own unsubscribe — call it in an
     * `$effect` cleanup. On a venue whose trade stream is not wired
     * (`streams.trades === false`) this subscribes to nothing and the returned
     * function is a no-op, which is what the caller already got before
     * FEAT-0016; it must not throw, because the callers are decorative.
     */
    subscribeTrades(symbol: string, onTrade: (trade: TradePrint) => void): () => void;
}

/**
 * The venue's socket, owned by the venue (FEAT-0227).
 *
 * `connectionManager` holds the session concerns that genuinely span both
 * venues and drives them through here, so nothing outside the adapter needs
 * to import a WebSocket service to start or stop one. The shape is the
 * `ManagedService` contract `connectionManager` already registered — the
 * change is who hands it over, not what it is.
 */
export interface ConnectionPort {
    /** Opens the venue's sockets. `force` reconnects an already-open one. */
    connect(force?: boolean): void;

    /**
     * Tears the venue's sockets and timers down. `switchProvider` calls this
     * on every registered venue before starting the next, which is what keeps
     * the switch atomic.
     */
    destroy(): void;
}

/** Account state, in the one normalised shape the stores read. */
export interface AccountPort {
    /**
     * Funding-rate history for one symbol. Bitunix-only today; `bitget`
     * resolves empty rather than throwing, because the popover that reads it
     * is informational.
     */
    fetchFundingRateHistory(
        symbol: string,
        limit?: number,
        priority?: RequestPriority,
    ): Promise<FundingRateHistoryItem[]>;

    /**
     * Leverage and margin mode as the venue currently has them for a symbol,
     * written into `tradeState.remoteLeverage` / `remoteMarginMode`.
     */
    fetchLeverageMarginMode(symbol: string): Promise<void>;

    /** Contract precision, size limits and leverage range for a symbol. */
    fetchTradingPairInfo(symbol: string): Promise<void>;
}

/**
 * Order operations. Everything here is state-changing on the venue and passes
 * the FEAT-0011 gate inside `tradeService`; the adapter adds no path around
 * it — `orderGate` is reached exactly as before.
 */
export interface TradingPort {
    placeOrder(params: PlaceOrderParams): Promise<unknown>;

    closePosition(params: {
        symbol: string;
        positionSide: "long" | "short";
        amount?: Decimal;
        forceFullClose?: boolean;
    }): Promise<unknown>;

    cancelOrder(symbol: string, orderId: string): Promise<unknown>;
    cancelAllOrders(symbol?: string, throwOnError?: boolean): Promise<unknown>;
    modifyOrder(params: ModifyOrderParams): Promise<unknown>;

    /** Resting TP/SL plans. `supports.tpSl === false` means the venue's route refuses these. */
    fetchTpSlOrders(view?: "pending" | "history"): Promise<TpSlOrder[]>;
    cancelTpSlOrder(order: TpSlOrder): Promise<unknown>;
    modifyTpSlOrder(params: {
        orderId: string;
        symbol: string;
        planType: "PROFIT" | "LOSS";
        triggerPrice: string;
        qty?: string;
        stopType?: "LAST_PRICE" | "MARK_PRICE";
    }): Promise<unknown>;

    /** Creates the one position-wide TP/SL plan a position may carry (FEAT-0070). */
    placePositionTpSl(params: {
        symbol: string;
        positionId: string;
        takeProfit?: { price: Decimal; stopType?: "LAST_PRICE" | "MARK_PRICE" };
        stopLoss?: { price: Decimal; stopType?: "LAST_PRICE" | "MARK_PRICE" };
    }): Promise<unknown>;

    /** Creates a partial TP/SL plan with an explicit quantity (FEAT-0070). */
    placeTpSlOrder(params: {
        symbol: string;
        positionId: string;
        takeProfit?: {
            price: Decimal;
            qty: Decimal;
            stopType?: "LAST_PRICE" | "MARK_PRICE";
            orderType?: "LIMIT" | "MARKET";
            orderPrice?: Decimal;
        };
        stopLoss?: {
            price: Decimal;
            qty: Decimal;
            stopType?: "LAST_PRICE" | "MARK_PRICE";
            orderType?: "LIMIT" | "MARKET";
            orderPrice?: Decimal;
        };
    }): Promise<unknown>;
}

/**
 * Which trading verbs Cachy has a *verified* wire format for on this venue.
 *
 * This is a declaration, not a guard: an unsupported verb still goes to the
 * proxy route and is refused there, exactly as it was before FEAT-0016 (see
 * `routes/api/tpsl/+server.ts`, which rejects any exchange but Bitunix). What
 * the flag buys is a UI that can stop offering the control in the first place
 * — which FEAT-0017 now does, reading `capabilities` off the adapter.
 */
export interface TradingSupport {
    /** Attached or standalone TP/SL plans. */
    tpSl: boolean;
    /** Reading leverage and margin mode back off the venue. */
    leverageMarginMode: boolean;
    /** Contract metadata (precision, size limits, tiers). */
    tradingPairInfo: boolean;
}

/** One exchange, behind one interface. */
export interface ExchangeAdapter {
    readonly id: ExchangeId;
    /**
     * What the venue accepts on an order (FEAT-0017). The adapter's own
     * declaration, read straight from its `<venue>Capabilities.ts` — not
     * looked up in a shared table, so widening one venue cannot widen
     * another. `exchangeCapabilities.ts` gathers the same declarations for
     * consumers that must not import the transport graph.
     */
    readonly capabilities: ExchangeCapabilities;
    readonly streams: AdapterStreams;
    readonly supports: TradingSupport;
    /** This venue's socket lifecycle (FEAT-0227). */
    readonly connection: ConnectionPort;
    readonly marketData: MarketDataPort;
    readonly account: AccountPort;
    readonly trading: TradingPort;
}
