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

/*
 * The shared close-all flow (BUG-0513, variant c).
 *
 * Two buttons reach the same operation — the positions panel and the panic
 * spot next to the kill switch in the risk settings — so the confirm-and-run
 * sequence lives here once instead of in both components. The sequence:
 *
 * 1. Read the facts (count, total notional) from the same store the panel
 *    renders, not re-derived per caller.
 * 2. Always ask. Close-all is deliberately absent from the
 *    confirmation-policy catalogue: a settings toggle for it would offer a
 *    way to unguard a bulk close by accident, so the dialog is
 *    unconditional and states what is about to happen.
 * 3. Run through the adapter (`activeExchange().trading`), never past it —
 *    FEAT-0016 keeps components off exchange-specific services.
 * 4. A second invocation while one runs is refused here. The gate's
 *    in-flight guard (BUG-0507) would catch a duplicate single request, but
 *    a Bitget flatten is a loop of closes, not one request, so the flow
 *    guards itself.
 *
 * Failures are reported by `tradeService.closeAllPositions` itself (failed
 * vs. leftover vs. unverified toasts); this resolves null on every
 * non-success path and never toasts twice.
 */

import { get } from "svelte/store";
import { Decimal } from "decimal.js";
import { _ } from "../locales/i18n";
import type { TranslationKey } from "../locales/schema";
import { modalState } from "./modal.svelte";
import { accountState } from "./account.svelte";
import { uiState } from "./ui.svelte";
import { tpSlState } from "./tpsl.svelte";
import { activeExchange } from "../services/exchange";
import { logger } from "../services/logger";

function t(key: string, values?: Record<string, string>): string {
    return get(_)(key as TranslationKey, values ? { values } : undefined);
}

let running = false;

/** True while a close-all triggered from any button is still working. */
export function isCloseAllRunning(): boolean {
    return running;
}

export interface CloseAllOutcome {
    /** Positions counted in the confirmation the trader agreed to. */
    confirmed: number;
}

/**
 * Confirms with count and total notional, then flattens every open position
 * (optionally scoped to one symbol). Resolves null when there is nothing to
 * close, the trader cancels, another flatten is running, or the run fails.
 */
export async function confirmAndCloseAllPositions(symbol?: string): Promise<CloseAllOutcome | null> {
    if (running) {
        logger.warn("market", "[CloseAll] Refusing a second close-all while one is running");
        return null;
    }
    const inScope = symbol
        ? accountState.positions.filter((p) => p.symbol === symbol)
        : accountState.positions;
    if (inScope.length === 0) {
        uiState.showToast(t("trade.closeAllEmpty"), "info");
        return null;
    }
    // Set for the dialog already, not just the run: two rapid clicks must
    // not open two confirmations (the modal store dedupes those as cancel,
    // but the refusal belongs here where the race is understood). The
    // finally below clears it on every path including cancel.
    running = true;
    try {
        // Client-computed Σ size × price — the same formula the positions panel
        // totals with, so the dialog quotes the number on screen. A Decimal is
        // always truthy, including the structural Decimal(0) "no data" default,
        // so the mark is only used when it is actually positive — otherwise the
        // dialog would understate notional with zero-priced legs.
        const priceOf = (p: (typeof inScope)[number]) =>
            p.markPrice && p.markPrice.gt(0) ? p.markPrice : p.entryPrice;
        const notional = inScope.reduce(
            (sum, p) => sum.plus(p.size.mul(priceOf(p))),
            new Decimal(0),
        );
        const confirmed = await modalState.show(
            t("trade.closeAllConfirmTitle"),
            t("trade.closeAllConfirmMessage", {
                count: String(inScope.length),
                notional: notional.toFixed(2),
            }),
            "confirm",
        );
        if (confirmed !== true) return null;

        await activeExchange().trading.closeAllPositions(symbol);
        uiState.showToast(t("trade.closeAllSuccess", { count: String(inScope.length) }), "success");
        // Same reasoning as a full close: the exchange drops a closed
        // position's plans, and a cached stop on a position that no longer
        // exists is worse than no stop at all.
        tpSlState.invalidate();
        return { confirmed: inScope.length };
    } catch {
        // Partial runs close some legs before failing: their cached stops
        // would otherwise linger as ghosts. Invalidating drops the still
        // open legs' cached plans too, but those refetch on the next read —
        // correct data at the cost of one reload, which beats a stale stop
        // on a closed position. The service owns failure reporting; this
        // stays quiet beyond the hygiene.
        tpSlState.invalidate();
        return null;
    } finally {
        running = false;
    }
}
