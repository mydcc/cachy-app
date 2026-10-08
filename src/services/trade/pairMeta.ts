/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * Pair metadata (precision, order-size limits, leverage range, status) for a
 * symbol — extracted from tradeService.ts (FEAT-0342).
 *
 * The in-flight bookkeeping is the only mutable state the domain has, so it
 * came along rather than staying behind as a field on the service; it is
 * scoped to one loader instance. The market-state writes arrive as a port: a
 * service must not reach into stores (eslint.architecture.boundaries.js).
 * These are public read endpoints — no credentials, no gate.
 */

import { Decimal } from "decimal.js";
import { normalizeSymbol } from "../../utils/symbolUtils";
import { appFetch } from "../../lib/appAuth";
import { logger } from "../logger";
import {
    BitunixTradingPairResponseSchema,
    BitgetContractsResponseSchema,
} from "../../types/apiSchemas";
import type { TradingPairInfo } from "../../stores/market/types";

/** The venue whose metadata is being read. */
export type MetaVenue = "bitunix" | "bitget";

/**
 * The market-state writes this module performs.
 *
 * Supplied rather than imported: `shouldFetchMeta` decides whether a read is
 * worth making at all (cooldown), `noteMetaFetch` records the attempt, and
 * `setSymbolMeta` publishes the result.
 */
export interface PairMetaSink {
    shouldFetchMeta(key: string): boolean;
    noteMetaFetch(key: string, ok: boolean): void;
    setSymbolMeta(key: string, info: TradingPairInfo): void;
}

export interface PairMetaLoader {
    /**
     * Loads precision, order-size limits, leverage range and status for
     * `symbol`. A failure records the attempt rather than writing a stub, so
     * a later fetch retries after the cooldown instead of reading as
     * "no precision".
     */
    fetchTradingPairInfo(symbol: string, venue: MetaVenue): Promise<void>;
}

/** In-flight metadata loads, so concurrent callers share one request. */
export function createPairMetaLoader(sink: PairMetaSink): PairMetaLoader {
    const metaFetchInflight: Record<string, Promise<void>> = {};

    async function fetchKeyedMeta(key: string, load: () => Promise<boolean>): Promise<void> {
        if (!sink.shouldFetchMeta(key)) return;
        const running = metaFetchInflight[key];
        if (running) {
            await running;
            return;
        }
        const flight = (async () => {
            try {
                sink.noteMetaFetch(key, await load());
            } catch {
                sink.noteMetaFetch(key, false);
            } finally {
                delete metaFetchInflight[key];
            }
        })();
        metaFetchInflight[key] = flight;
        await flight;
    }

    /** Loads one Bitunix row; true when an entry was written. */
    async function loadBitunixPairInfo(key: string, symbol: string): Promise<boolean> {
        try {
            const response = await appFetch(`/api/trading-pairs?symbols=${encodeURIComponent(symbol)}`);
            if (!response.ok) return false;
            const json = await response.json();

            const validation = BitunixTradingPairResponseSchema.safeParse(json);
            if (!validation.success) {
                logger.error("network", "[TradeService] Invalid trading-pairs response", validation.error.issues);
                return false;
            }
            const entry = validation.data.data?.[0];
            if (!entry) return false;

            sink.setSymbolMeta(key, {
                symbol: entry.symbol,
                basePrecision: entry.basePrecision,
                quotePrecision: entry.quotePrecision,
                minTradeVolume: entry.minTradeVolume ?? null,
                maxLimitOrderVolume: entry.maxLimitOrderVolume ?? null,
                maxMarketOrderVolume: entry.maxMarketOrderVolume ?? null,
                minLeverage: entry.minLeverage,
                maxLeverage: entry.maxLeverage,
                defaultLeverage: entry.defaultLeverage,
                priceProtectScope: entry.priceProtectScope ?? null,
                symbolStatus: entry.symbolStatus,
                isApiSupported: entry.isApiSupported,
            });
            return true;
        } catch (e) {
            logger.debug("api", "[TradeService] fetchTradingPairInfo failed", e);
            return false;
        }
    }

    /** Loads one Bitget V2 contracts row; true when an entry was written. */
    async function loadBitgetInstrumentInfo(key: string, symbol: string): Promise<boolean> {
        const toInt = (v: string | undefined): number | undefined => {
            if (v === undefined) return undefined;
            const n = parseInt(v, 10);
            return Number.isFinite(n) ? n : undefined;
        };
        const toDecimalOrNull = (v: string | undefined): Decimal | null => {
            if (v === undefined) return null;
            try {
                const d = new Decimal(v);
                return d.isFinite() ? d : null;
            } catch {
                return null;
            }
        };
        try {
            const response = await appFetch(`/api/bitget/contracts?symbols=${encodeURIComponent(symbol)}`);
            if (!response.ok) return false;
            const json = await response.json();

            const validation = BitgetContractsResponseSchema.safeParse(json);
            if (!validation.success || validation.data.code !== "00000") {
                logger.error("network", "[TradeService] Invalid bitget contracts response");
                return false;
            }
            const row = validation.data.data?.find(
                (r) => normalizeSymbol(r.symbol, "bitget") === key,
            );
            if (!row) return false;

            sink.setSymbolMeta(key, {
                symbol: row.symbol,
                basePrecision: toInt(row.volumePlace),
                quotePrecision: toInt(row.pricePlace),
                minTradeVolume: toDecimalOrNull(row.minTradeNum),
                maxLimitOrderVolume: toDecimalOrNull(row.maxOrderQty),
                maxMarketOrderVolume: toDecimalOrNull(row.maxMarketOrderQty),
                minLeverage: toInt(row.minLever),
                maxLeverage: toInt(row.maxLever),
                defaultLeverage: undefined,
                priceProtectScope: null,
                // V2 reports "normal"; the gate and the panel speak Bitunix
                // ("OPEN"). Mapped here so one vocabulary rules downstream;
                // anything else passes through raw and refuses closed.
                symbolStatus: row.symbolStatus === "normal" ? "OPEN" : row.symbolStatus,
                isApiSupported: undefined,
            });
            return true;
        } catch (e) {
            logger.debug("api", "[TradeService] fetchBitgetInstrumentInfo failed", e);
            return false;
        }
    }

    // BUG-0501: venue-dispatched internally — Bitunix reads market/
    // trading_pairs, Bitget reads V2 mix contracts — but one method, so the
    // adapter table keeps a single verb to declare. The entry is keyed
    // venue-normalized, and every miss path records the attempt instead of
    // writing a stub: a failed fetch retries after the cooldown, never reads
    // as "no precision".
    async function fetchTradingPairInfo(symbol: string, venue: MetaVenue): Promise<void> {
        const key = normalizeSymbol(symbol, venue);
        await fetchKeyedMeta(key, () =>
            venue === "bitget"
                ? loadBitgetInstrumentInfo(key, symbol)
                : loadBitunixPairInfo(key, symbol),
        );
    }

    return { fetchTradingPairInfo };
}
