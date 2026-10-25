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

/** Structural port so this module stays independent of the toast service. */
export interface DuckToastPort {
    success(message: string): void;
    warning(message: string): void;
}

/**
 * The duck's notifier is decided at emit time, not at construction time: a
 * notification toggle must not rebuild the instance (and re-save its state).
 */
export function createDuckNotifier(
    isEnabled: () => boolean,
    toasts: DuckToastPort,
): DuckToastPort {
    return {
        success(message) {
            if (isEnabled()) toasts.success(message);
        },
        warning(message) {
            if (isEnabled()) toasts.warning(message);
        },
    };
}

/**
 * Forwards one already-drained event to the live companion.
 *
 * Returns whether the event was handled, so the caller can start its render
 * loop only for real animation work. Extracted from the component because the
 * master/notification/trade gates are the feature's core behaviour and must
 * not live only in untested WebGL-owning code.
 */
export function forwardDuckEvent(
    logic: { handleEvent(event: DuckTriggerEvent): void } | null,
    event: DuckTriggerEvent,
    showDuck: boolean,
    reactToTrades: boolean,
): boolean {
    if (!logic || !shouldHandleDuckEvent(event, showDuck, reactToTrades)) {
        return false;
    }
    logic.handleEvent(event);
    return true;
}

/**
 * Cross-tab reset detection. `resetDuckProgress()` fires a same-document
 * event; other tabs only observe the key removal. A re-seed (non-null
 * `newValue`) must be ignored or two tabs would ping-pong writes.
 */
export function isDuckResetStorageEvent(event: {
    key: string | null;
    newValue: string | null;
}): boolean {
    // `key === null` is `localStorage.clear()` (the Danger Zone wipe).
    const removedDuckState =
        event.key === DUCK_STATE_STORAGE_KEY || event.key === null;
    return removedDuckState && event.newValue === null;
}
