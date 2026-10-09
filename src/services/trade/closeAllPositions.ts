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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
/**
 * Close-all lane — extracted from tradeService.ts (FEAT-0342).
 *
 * One method, verbatim: venue-native bulk close on bitunix, verified loop
 * over an exchange-fresh list everywhere else (BUG-0514 — no guessed wire
 * format for a call that closes real positions, BUG-0001). Never reports
 * success while anything remains open. Everything it needs from the owner
 * arrives as a port — including the single-close lane itself and the
 * toast-carrying shortfall reports, which stay owner-side exactly as in
 * ./accountSettings.
 */

import { logger } from "../logger";
import { TRADE_ERRORS } from "./tradeErrors";
import type { ClosePositionParams } from "./closePosition";
import type { PartialIntent } from "./payloadCodec";
import type { NormalizedPosition } from "../../types/exchange";
import type { OMSPosition } from "../omsTypes";
import type { Venue } from "../../utils/exchange/restSigningPlan";
import type { TpSlVenue } from "./tpSlService";

export interface CloseAllPositionsPorts {
    /** The venue the UI is configured for; decides the close-all path. */
    activeVenue(): TpSlVenue;
    /** The order gate. Every write goes through it — there is no other path. */
    gatedRequest: <T>(intent: PartialIntent) => Promise<T>;
    /** Exchange-fresh position list; null means no read was possible. */
    readFreshPositions(provider: Venue): Promise<NormalizedPosition[] | null>;
    /** Post-run flat verification against the venue. */
    verifyFlat(
        provider: Venue,
        symbol?: string,
    ): Promise<{ leftover: string[]; unverified: boolean }>;
    /** Names the shortfall with one toast and throws (owner-side). */
    reportFlattenShortfall(args: {
        failedCount: number;
        failedSymbols: string[];
        leftover: string[];
        unverified: boolean;
        symbol?: string;
    }): void;
    /** The single-close lane; the fallback path flattens through it. */
    closePosition(params: ClosePositionParams): Promise<unknown>;
    /** Cached book for the no-keys best-effort path (owner-side). */
    cachedPositions(): OMSPosition[];
    /** Catch-tail: generic failure toast, then throws (owner-side). */
    reportCloseAllFailure(symbol: string | undefined, cause: unknown): void;
}

export function createCloseAllPositionsService(ports: CloseAllPositionsPorts) {
    async function closeAllPositions(symbol?: string) {
        logger.log("market", `[CloseAll] Closing all positions${symbol ? ` for ${symbol}` : ""}`);
        try {
            const provider = ports.activeVenue();
            if (provider === "bitunix") {
                const result = await ports.gatedRequest({
                    kind: "bulk",
                    endpoint: "/api/orders",
                    payload: {
                        type: "close-all-positions",
                        symbol: symbol || undefined,
                    },
                    displayed: symbol ? { symbol } : {},
                });
                // The venue enumerates, so the work list cannot be stale —
                // but a mid-flatten race (opened during the run) and a
                // partial fill apply to this path too. Same guarantee as the
                // fallback: no success reported while anything remains open.
                const { leftover, unverified } = await ports.verifyFlat(provider, symbol);
                if (leftover.length > 0 || unverified) {
                    ports.reportFlattenShortfall({
                        failedCount: 0,
                        failedSymbols: [],
                        leftover,
                        unverified,
                        symbol,
                    });
                    // Unreachable under the port contract (the report
                    // throws) — the fallthrough guard if a future port ever
                    // returns instead: never report success while anything
                    // remains open.
                    throw new Error(TRADE_ERRORS.CLOSE_ALL_FAILED);
                }
                return result;
            }

            /*
             * Fallback for non-Bitunix providers (BUG-0514): no verified
             * native bulk-close is wired. Bitget documents
             * POST /api/v2/mix/order/close-positions ("Flash Close Position",
             * symbol optional) and the UTA API documents an account-wide
             * close — but neither wire format is verified against the venue
             * (no local reference, no sandbox run), and BUG-0001 is the
             * standing reminder not to guess an exchange's wire format for a
             * call that closes real positions. FEAT-0525 pins the full Bitget
             * reference; until then the loop below over an exchange-fresh
             * list is the complete path, not a placeholder.
             */
            // A failed read throws FETCH_FAILED: flattening blind and
            // reporting success is the defect. No keys means no read is
            // possible — proceed on the cache best-effort (the closes then
            // refuse at signing) and let verification report unverified.
            const fresh = await ports.readFreshPositions(provider);
            const toClose = (fresh ?? ports.cachedPositions())
                .filter((p) => !symbol || p.symbol === symbol)
                .map((p) => ({
                    symbol: p.symbol,
                    positionSide: (p.side.toLowerCase() === "short" ? "short" : "long") as
                        "long" | "short",
                }));
            const promises = toClose.map((p) =>
                ports.closePosition({ symbol: p.symbol, positionSide: p.positionSide, forceFullClose: true }),
            );
            const results = await Promise.allSettled(promises);

            const failures = results.filter((r) => r.status === "rejected");
            const failedSymbols = [
                ...new Set(
                    results
                        .map((r, i) => r.status === "rejected" ? (toClose[i]?.symbol ?? `position[${i}]`) : null)
                        .filter((s): s is string => s !== null),
                ),
            ];

            const { leftover, unverified } = await ports.verifyFlat(provider, symbol);
            if (failures.length > 0 || leftover.length > 0 || unverified) {
                ports.reportFlattenShortfall({
                    failedCount: failures.length,
                    failedSymbols,
                    leftover,
                    unverified,
                    symbol,
                });
                // Same fallthrough guard as the native path above.
                throw new Error(TRADE_ERRORS.CLOSE_ALL_FAILED);
            }

            return results;
        } catch (e: unknown) {
            // Already reported specifically above (failed/leftover/unverified
            // toast) — rethrow untouched so the trader is not toasted twice,
            // once with names and once without.
            if (e instanceof Error && e.message === TRADE_ERRORS.CLOSE_ALL_FAILED) throw e;
            logger.error("market", "[CloseAll] Failed to close all positions", e);
            ports.reportCloseAllFailure(symbol, e);
            // Same fallthrough guard: the report throws under its contract.
            throw new Error(TRADE_ERRORS.CLOSE_ALL_FAILED, { cause: e });
        }
    }
    return { closeAllPositions };
}
