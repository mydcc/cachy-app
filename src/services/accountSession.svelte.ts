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
 * Account session — FEAT-0026.
 *
 * Switching accounts has to do two things, and only one of them is obvious.
 *
 * The obvious one is clearing: positions, orders, balances and the cached
 * leverage/margin mode all belong to the account they were fetched from, and
 * showing account A's numbers under account B's name is the "no view shows
 * data from two accounts without labelling" criterion failing in the worst
 * possible way. `reset()` does that.
 *
 * The one that is easy to miss is the *in-flight* request. Every account
 * fetch in this app reads credentials, awaits a network round trip, and then
 * writes the result into a shared store. Nothing in that sequence re-checks
 * which account it started for. A switch during the await leaves the write
 * unopposed: `syncService` is the extreme case, with three sequential REST
 * calls and a deliberate pause between kline batches, so its window is
 * seconds to minutes.
 *
 * A rotating counter answers that. A caller captures `current()` before its
 * first `await` and checks `isCurrent()` before it writes; a write from a
 * superseded session is dropped rather than blended. The token is branded for
 * the same reason `GatePass` is — a plain number invites a call site to
 * "helpfully" pass `0`.
 *
 * What this deliberately does NOT clear is in `reset()`'s own note.
 */

import { accountState } from "../stores/account.svelte";
import { omsService } from "./omsService";
import { tpSlState } from "../stores/tpsl.svelte";
import { tradeState } from "../stores/trade.svelte";
import { paperState } from "../stores/paperTrading.svelte";
import { logger } from "./logger";

declare const sessionBrand: unique symbol;

/**
 * Proof that a write was started under the account session still current.
 *
 * Carries `seq` so a holder can be compared and logged, but the brand means
 * only this module can mint one.
 */
export interface AccountSession {
    readonly [sessionBrand]: true;
    readonly seq: number;
}

/** Why the session rotated. Kept for the log line, not for control flow. */
export type RotationReason = "account-switch" | "venue-switch";

class AccountSessionStore {
    /**
     * Reactive so a component can key an `$effect` on it and drop its own
     * local caches — the ones that live in component `$state` and that
     * `accountState.reset()` therefore cannot reach.
     */
    seq = $state(0);

    /** The session a caller is about to do work under. */
    current(): AccountSession {
        return { seq: this.seq } as unknown as AccountSession;
    }

    /** Whether work started under `session` may still write. */
    isCurrent(session: AccountSession | null | undefined): boolean {
        return session?.seq === this.seq;
    }

    /**
     * Invalidate every in-flight read without touching any store.
     *
     * Separate from `reset()` so the ordering there can be deliberate; see
     * the note on `reset()`.
     */
    rotate(reason: RotationReason): void {
        this.seq += 1;
        logger.log("governance", `[AccountSession] rotated to ${this.seq}`, { reason });
    }

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
    reset(reason: RotationReason): void {
        this.rotate(reason);

        accountState.reset();
        omsService.reset();
        tpSlState.reset();
        tradeState.clearRemoteAccountState();

        // The paper book renders through the stores just cleared, so without
        // this a switch would blank a simulated trader's positions, orders and
        // balance. `paperTradingService.setEnabled` uses the same
        // clear-then-re-mirror pairing, for the same reason. Imported lazily
        // to keep this module free of a cycle: `paperTradingService` already
        // imports `accountState` and `omsService`.
        if (paperState.enabled) {
            void import("./paperTradingService").then(({ paperTradingService }) =>
                paperTradingService.syncToStores(),
            );
        }
    }
}

export const accountSession = new AccountSessionStore();
