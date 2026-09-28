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
 *
 * Account session clearing — FEAT-0026.
 *
 * Switching accounts has to do two things, and only one of them is obvious.
 *
 * The obvious one is clearing: positions, orders, balances and the cached
 * leverage/margin mode all belong to the account they were fetched from, and
 * showing account A's numbers under account B's name is the "no view shows
 * data from two accounts without labelling" criterion failing in the worst
 * possible way. `reset()` does that.
 *
 * The one that is easy to miss is the *in-flight* request. The epoch that
 * answers it — `rotate`/`current`/`isCurrent` — lives in `accountEpoch` now,
 * split out for BUG-0419 so a mode switch can invalidate its own in-flight
 * reads without importing this module (and closing a cycle through
 * `paperTradingService`). `reset()` still rotates first, then clears.
 *
 * What this deliberately does NOT clear is in `reset()`'s own note.
 */

import { accountState } from "../stores/account.svelte";
import { omsService } from "./omsService";
import { tpSlState } from "../stores/tpsl.svelte";
import { tradeState } from "../stores/trade.svelte";
import { paperState } from "../stores/paperTrading.svelte";
import { paperTradingService } from "./paperTradingService";
import { accountEpoch, type RotationReason } from "./accountEpoch.svelte";

/**
 * Clear the state that belongs to the account being left.
 *
 * **Rotation happens first, deliberately — but defensively.**
 * `accountState.reset()` ends with `notifyListeners()`, and the listeners
 * it wakes go and fetch. That fan-out is debounced, so today nothing runs
 * synchronously inside `reset()` and the ordering is unobservable. It is
 * written this way so that a listener which later becomes synchronous
 * does not start carrying the *old* session and silently discarding its
 * own results. No test asserts the ordering, because none can.
 *
 * Not cleared, each for a reason:
 * - `paperState` — a separate book, not account-scoped at all. It is
 *   re-mirrored below, because `paperTradingService` renders it *through*
 *   the same live stores this clears, so clearing them would empty the
 *   panel a simulated trader is looking at.
 * - `marketState` — Class C, venue-scoped, identical for every account.
 * - `orderAuditService` — append-only, and already stamped with the
 *   provider and key fingerprint. Clearing it would destroy the record of
 *   what the *previous* account did, which is the opposite of what an
 *   audit log is for.
 * - `riskLimits` — the user's own policy, not fetched state.
 */
export function resetAccountSession(reason: RotationReason): void {
    accountEpoch.rotate(reason);

    accountState.reset();
    omsService.reset();
    tpSlState.reset();
    tradeState.clearRemoteAccountState();

    // The paper book renders through the stores just cleared, so without
    // this a switch would blank a simulated trader's positions, orders and
    // balance. `paperTradingService.setEnabled` uses the same
    // clear-then-re-mirror pairing, for the same reason.
    //
    // Synchronous, and imported statically: a dynamic import here left the
    // panel empty for a microtask and made the clear only partly
    // observable from a caller's point of view. There is no cycle to
    // avoid — `paperTradingService` reaches `accountState`, `omsService`,
    // `tradeState` and `paperState`, and none of them reaches back here.
    //
    // `syncToStores` is itself a no-op when paper mode is off
    // (`paperAccountFeed()` returns null), so the guard below is about
    // not doing pointless work, not about safety.
    if (paperState.enabled) paperTradingService.syncToStores();
}

/**
 * The account-session surface a `reset` belongs to.
 *
 * Kept as an object so the call sites that predate the BUG-0419 split
 * (`accountSession.reset(...)`) read unchanged; the epoch half now lives on
 * `accountEpoch`.
 */
export const accountSession = {
    reset: resetAccountSession,
};
