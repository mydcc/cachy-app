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

import { browser } from "$app/env";
import type { DuckTriggerEvent } from "./types";

/** Class A: the duck's progress never leaves the device. */
export const DUCK_STATE_STORAGE_KEY = "duck_dao_state";

/**
 * In-page signal for a scoped reset. `FXOverlay` owns the live `DuckLogic`
 * instance, so the settings surface cannot clear its in-memory copy directly;
 * it removes the stored key and asks the overlay to rebuild from defaults.
 */
export const DUCK_PROGRESS_RESET_EVENT = "cachy:duck-progress-reset";

/**
 * Clears only the duck's own key. The Danger Zone wipe clears every key; this
 * is the scoped alternative for a trader who wants a fresh companion without
 * losing settings, journal or credentials.
 */
export function resetDuckProgress(): void {
    if (!browser) return;
    localStorage.removeItem(DUCK_STATE_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(DUCK_PROGRESS_RESET_EVENT));
}

/**
 * Whether the visual owner should forward an event to `DuckLogic`.
 *
 * Keeping this pure makes the two switches testable without a WebGL scene:
 * the master switch drops every event (no XP, no streak, no animation), and
 * trade reactions drop `trade_win`/`trade_loss` specifically so the trade XP
 * bonus cannot accrue while it is off.
 */
export function shouldHandleDuckEvent(
    event: DuckTriggerEvent,
    showDuck: boolean,
    reactToTrades: boolean,
): boolean {
    if (!showDuck) return false;
    if (
        !reactToTrades &&
        (event.type === "trade_win" || event.type === "trade_loss")
    ) {
        return false;
    }
    return true;
}
