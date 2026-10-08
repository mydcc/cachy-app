/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * FEAT-0342 — the position lifecycle lane.
 *
 * Three things that only exist together: how a single-position path gets a
 * trustworthy amount, how an exchange-fresh list reaches the OMS, and how a
 * flatten is proven. They were one private cluster in `tradeService`, each
 * reaching the others through `this`, so none could be read or tested on its
 * own. `flashClosePosition` stays in the facade: it hangs off the order path
 * (`orderGate`, `gatedRequest`, the close-order field builders) and dragging
 * that along would move the money path without moving a domain.
 *
 * Everything here reached through `ports`. The store surface is deliberately
 * narrow — the OMS, the active account's keys, the provider, the account
 * snapshot, the paper feed and the read ticket — which is what makes this
 * lane separable from the rest of the class.
 *
 * Not here: `reportFlattenShortfall`. It owns the user-facing message, and
 * this repository's rule for an extracted module is to produce message *keys*
 * and let the owner translate (the reason `warnUnconfirmed` is a port in
 * `./accountSettings`). Moving it would drag svelte-i18n into a service
 * module for no domain gain.
 */

import { appFetch } from "../../lib/appAuth";
import { safeJsonParse } from "../../utils/safeJson";
import { exchangeSignedFetch } from "../../utils/exchange/browserSigning";
import { buildPositionsQueryParams } from "../../utils/exchange/venueQueries";
import { parseDecimal, unwrapApiEnvelope } from "../../utils/utils";
import { logger } from "../logger";
import { mapToOMSPosition } from "../mappers";
import { PositionRawSchema } from "../../types/apiSchemas";
import { TradeError, TRADE_ERRORS } from "./tradeErrors";
import type { NormalizedPosition } from "../../types/exchange";
import type { OMSPosition } from "../omsTypes";
import type { ExchangeProvider } from "../../stores/settings/accounts";

/**
 * The provider this lane acts for.
 *
 * Deliberately the narrow union, not `string`: the source it replaces,
 * `settingsState.apiProvider`, is already `"bitunix" | "bitget"`, so widening
 * it here would push the cast for `buildPositionsQueryParams` and `venue:`
 * down into the bodies and let an unvalidated string reach a signing plan.
 */
export type PositionProvider = ExchangeProvider;

/** Opaque read-order ticket; the port owns what it means. */
export type PositionsReadTicket = unknown;

/** The shape `paperAccountFeed()` hands back, narrowed to what is read here. */
interface PaperFeed {
    positions(): NormalizedPosition[];
}

export interface PositionLifecyclePorts {
    /** The configured venue, already coerced to a known provider. */
    activeProvider(): PositionProvider;
    /** Credentials of the active account for `provider`. */
    activeKeys(
        provider: PositionProvider,
    ): { key: string; secret: string; passphrase?: string } | null;
    /** Current OMS book. */
    getPositions(): OMSPosition[];
    /** Add or merge one OMS entry. */
    updatePosition(position: OMSPosition): void;
    /** Drop one OMS entry. */
    removePosition(symbol: string, side: "long" | "short"): void;
    /** The paper simulator's book, or `null` on a live venue. */
    paperFeed(): PaperFeed | null;
    /** Writes the account snapshot the position views read. */
    hydratePositions(
        positions: NormalizedPosition[],
        source: "live",
    ): void;
    /** Begins a position read; its ticket decides whether its answer may land. */
    beginPositionsRead(): PositionsReadTicket;
    /** Whether a read issued at `ticket` may still write. */
    mayApplyPositionsRead(ticket: PositionsReadTicket): boolean;
}

export interface PositionLifecycleService {
    ensurePositionFreshness(
        symbol: string,
        positionSide: "long" | "short",
    ): Promise<OMSPosition | undefined>;
    refreshPositionsForProvider(): Promise<void>;
    readFreshPositions(
        provider: ExchangeProvider,
    ): Promise<NormalizedPosition[] | null>;
    verifyFlat(
        provider: ExchangeProvider,
        symbol?: string,
    ): Promise<{ leftover: string[]; unverified: boolean }>;
}

export function createPositionLifecycleService(
    ports: PositionLifecyclePorts,
): PositionLifecycleService {
    // Hardening: Centralized Freshness Check
    async function ensurePositionFreshness(symbol: string, positionSide: "long" | "short") {
        let positions = ports.getPositions();
        let position = positions.find(
            (p) => p.symbol === symbol && p.side === positionSide
        );

        // If cached position is stale (> 200ms), force a refresh to ensure quantity is correct.
        const MAX_POS_AGE_MS = 200;
        const now = Date.now();

        if (position && (now - (position.lastUpdated ?? 0) > MAX_POS_AGE_MS)) {
             logger.warn("market", `[Freshness] Position stale (${now - (position.lastUpdated ?? 0)}ms). Forcing refresh.`);
             try {
                await refreshPositionsForProvider();
                positions = ports.getPositions();
                position = positions.find(
                    (p) => p.symbol === symbol && p.side === positionSide
                );
             } catch (e) {
                logger.error("market", `[Freshness] Stale refresh failed`, e);
                // HARDENING: If refresh fails, do NOT trust stale data for critical ops.
                // We throw here to abort the operation.
                throw new Error(TRADE_ERRORS.FETCH_FAILED, { cause: e });
             }
        }

        if (!position) {
            logger.warn("market", `[Freshness] Position not found in cache. Accessing API fallback for: ${symbol} ${positionSide}`);
            try {
                await refreshPositionsForProvider();
                positions = ports.getPositions();
                position = positions.find(
                    (p) => p.symbol === symbol && p.side === positionSide
                );
             } catch (e) {
                logger.error("market", `[Freshness] API Fallback failed`, e);
                // Propagate error if we really expected a position but couldn't confirm
                throw e;
             }
        }

        return position;
    }

    /**
     * Provider-aware OMS refresh for the single-position paths (BUG-0527).
     *
     * `ensurePositionFreshness` resolves amounts exclusively through the OMS,
     * but its fallback (`fetchOpenPositionsFromApi`) is Bitunix-only: on live
     * Bitget nothing ever fed the OMS, so every single/flash close threw
     * `POSITION_NOT_FOUND` without sending a request. Per the item's triage —
     * one truth, not two — non-Bitunix venues refresh through the same
     * provider-agnostic `/api/positions` read the positions panel uses
     * (`readFreshPositions`, which mirrors into the OMS), rather than a fresh
     * read that would leave two sources of truth in the money path.
     *
     * The refresh carries the bulk path's eviction guarantee: mirrored keys
     * the exchange no longer lists are dropped, so a flattened position does
     * not linger as an OMS ghost a later single close would size off. The
     * 200 ms staleness rule above is untouched — this only decides *how* a
     * refresh happens, never *whether* one is required.
     *
     * Paper mode is excluded on purpose: the simulator owns the book and
     * feeds the OMS itself (`paperTradingService`) — a REST mirror would
     * shadow it. Bitunix keeps its exact current path untouched: its OMS
     * feed is live over WS with real positionIds, and the mirror carries
     * none (see `mirrorPositionsToOms`).
     */
    async function refreshPositionsForProvider(): Promise<void> {
        const provider = ports.activeProvider();
        if (provider === "bitunix") {
            await fetchOpenPositionsFromApi();
            return;
        }
        if (ports.paperFeed()) return;
        const fresh = await readFreshPositions(provider);
        // Null means no credentials to prove anything with — nothing to
        // mirror, and nothing proven gone, so nothing is evicted either.
        if (fresh !== null) evictMirroredGhosts(fresh);
    }

    async function fetchOpenPositionsFromApi() {
        if (ports.activeProvider() !== "bitunix") return; // Only Bitunix supported for now

        try {
            // W-6: Use generalized provider key lookup instead of hardcoding 'bitunix'
            const provider = ports.activeProvider();
            const keys = ports.activeKeys(provider);
            if (!keys?.key || !keys?.secret) return;

            // The signed query is empty here — the route has no filter to sign —
            // and the envelope carries it as an empty `x-api-query` rather than
            // omitting the header, which is how presence and emptiness stay
            // distinguishable on the wire.
            const pendingResponse = await exchangeSignedFetch({
                cachyPath: "/api/sync/positions-pending",
                keys: { apiKey: keys.key, apiSecret: keys.secret },
                fetchFn: appFetch,
                payload: {},
                queryParams: {},
            });

            if (!pendingResponse.ok) throw new Error(TRADE_ERRORS.FETCH_FAILED);

            const pendingText = await pendingResponse.text();
            const pendingResult = safeJsonParse(pendingText);
            if (pendingResult.error) throw new TradeError(pendingResult.error, "trade.apiError");

            // Hardening: Best Effort Processing
            // Instead of failing the entire batch on one malformed entry, we validate per item.
            const rawList = Array.isArray(pendingResult.data) ? pendingResult.data : [];

            if (rawList.length === 0) {
                 // Nothing to process, but we might want to clear OMS positions if the API explicitly says "empty list"
                 // Currently OMS sync is additive/update-based. Full clearing is handled by specialized logic if needed.
            }

            let errorCount = 0;

            for (const item of rawList) {
                // Per-item validation
                const validation = PositionRawSchema.safeParse(item);

                if (validation.success) {
                    try {
                        // Use centralized mapper
                        ports.updatePosition(mapToOMSPosition(validation.data));
                    } catch (mapError) {
                         logger.warn("market", "[TradeService] Mapping error for position", mapError);
                         errorCount++;
                    }
                } else {
                    // Log but don't crash
                    logger.warn("market", "[TradeService] Invalid position schema skipped", { item, error: validation.error });
                    errorCount++;
                }
            }

            if (errorCount > 0) {
                logger.warn("market", `[TradeService] Sync completed with ${errorCount} skipped invalid items.`);
            }

        } catch (e: unknown) {
            logger.error("market", "[TradeService] Failed to fetch open positions", e);
            throw e;
        }
    }

    async function readFreshPositions(provider: ExchangeProvider): Promise<NormalizedPosition[] | null> {
        // BUG-0587: taken before the first await. This read hydrates the store
        // on the close-all verification path and used to take no ticket, so a
        // response landing after an account or mode switch re-stamped the
        // snapshot under the new session. The list it returns is still used
        // for the verification itself — only the *write* is gated, so a stale
        // response still fails the caller's check rather than passing it.
        const ticket = ports.beginPositionsRead();

        const paper = ports.paperFeed();
        if (paper) return paper.positions();
        const keys = ports.activeKeys(provider);
        if (!keys?.key || !keys?.secret) return null;
        const response = await exchangeSignedFetch({
            cachyPath: "/api/positions",
            keys: { apiKey: keys.key, apiSecret: keys.secret, passphrase: keys.passphrase },
            venue: provider,
            payload: { exchange: provider },
            queryParams: buildPositionsQueryParams(provider),
            headers: { "X-Provider": provider },
            fetchFn: appFetch,
        });
        const json = await response.json();
        const { data } = unwrapApiEnvelope<{ positions: NormalizedPosition[] }>(json);
        if (data === null || !data.positions) throw new Error(TRADE_ERRORS.FETCH_FAILED);
        if (ports.mayApplyPositionsRead(ticket)) {
            ports.hydratePositions(data.positions, "live");
            if (provider !== "bitunix") mirrorPositionsToOms(data.positions);
        }
        return data.positions;
    }

    /**
     * OMS keys (`symbol:side`) this lane mirrored from an exchange-fresh
     * read (non-Bitunix venues only — see `mirrorPositionsToOms`). The
     * post-flatten read evicts tracked keys the exchange no longer lists, so
     * a flattened position does not linger as an OMS ghost that a later
     * single close would size off (BUG-0527's evidence calls this out: single
     * closes resolve amounts through the OMS).
     */
    const mirroredOmsKeys = new Set<string>();

    /**
     * Mirrors an exchange-fresh list into the OMS (non-Bitunix venues only).
     *
     * Without this the closes below cannot run where nothing else feeds the
     * OMS: on live Bitget neither its WS channel nor its REST refresh writes
     * there, so `closePosition` — which resolves amounts through
     * `ensurePositionFreshness` — would throw `POSITION_NOT_FOUND` for every
     * leg (single closes through the same path are affected; tracked
     * separately, not fixed here). Bitunix is excluded on purpose: its OMS
     * feed is live over WS with real positionIds, and a mirror must never
     * overwrite those — its close requires the venue's own id
     * unconditionally (BUG-0062/BUG-0063). The mirror carries no id at all,
     * so `updatePosition` merges rather than replaces, and the venue body
     * for these venues needs none (symbol, side, amount).
     *
     * Add/update only, mirroring the paper simulator's lead: entries the
     * exchange no longer lists are simply never enumerated, and the
     * post-flatten read below is what proves them gone.
     */
    function mirrorPositionsToOms(list: NormalizedPosition[]): void {
        for (const p of list) {
            const side = p.side.toLowerCase() === "short" ? "short" : "long";
            mirroredOmsKeys.add(`${p.symbol}:${side}`);
            ports.updatePosition({
                symbol: p.symbol,
                side,
                amount: parseDecimal(p.size),
                entryPrice: parseDecimal(p.entryPrice),
                unrealizedPnl: parseDecimal(p.unrealizedPnL),
                leverage: parseDecimal(p.leverage),
                marginMode: (p.marginMode || "").toLowerCase().startsWith("isolat")
                    ? "isolated"
                    : "cross",
                liquidationPrice: parseDecimal(p.liquidationPrice),
                margin: parseDecimal(p.margin),
                markPrice: parseDecimal(p.markPrice),
                lastUpdated: Date.now(),
            });
        }
    }

    /**
     * Post-flatten verification shared by both close-all paths: success is
     * not reported while a position on the account remains open. A position
     * that appeared mid-flatten was never in the work list and produces no
     * rejection, so per-leg results cannot prove flat — only a fresh read
     * can. Never throws: a read that itself fails is reported as unverified
     * rather than as success.
     */
    async function verifyFlat(
        provider: ExchangeProvider,
        symbol?: string,
    ): Promise<{ leftover: string[]; unverified: boolean }> {
        try {
            const after = await readFreshPositions(provider);
            if (after === null) return { leftover: [], unverified: true };
            evictMirroredGhosts(after);
            const inScope = symbol ? after.filter((p) => p.symbol === symbol) : after;
            return { leftover: [...new Set(inScope.map((p) => p.symbol))], unverified: false };
        } catch (e) {
            logger.error("market", "[CloseAll] Post-flatten verification read failed", e);
            return { leftover: [], unverified: true };
        }
    }

    /**
     * Drops mirrored OMS entries the exchange no longer lists. Only keys
     * this lane mirrored are ever evicted — the Bitunix WS feed's entries
     * (with real positionIds) are never tracked and never touched. Runs on
     * the full fresh list regardless of symbol scope: a position absent
     * account-wide is gone, not out of scope.
     */
    function evictMirroredGhosts(fresh: NormalizedPosition[]): void {
        const open = new Set(
            fresh.map((p) => `${p.symbol}:${p.side.toLowerCase() === "short" ? "short" : "long"}`),
        );
        for (const key of mirroredOmsKeys) {
            if (open.has(key)) continue;
            const separator = key.lastIndexOf(":");
            const symbol = key.slice(0, separator);
            const side = key.slice(separator + 1);
            if (symbol && (side === "long" || side === "short")) {
                ports.removePosition(symbol, side);
            }
            mirroredOmsKeys.delete(key);
        }
    }

    return {
        ensurePositionFreshness,
        refreshPositionsForProvider,
        readFreshPositions,
        verifyFlat,
    };
}