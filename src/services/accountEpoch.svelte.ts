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
 * Account session epoch — FEAT-0026, split out for BUG-0419.
 *
 * Every account fetch in this app reads credentials, awaits a network round
 * trip, and then writes the result into a shared store. Nothing in that
 * sequence re-checks which account it started for. A switch during the await
 * leaves the write unopposed: `syncService` is the extreme case, with three
 * sequential REST calls and a deliberate pause between kline batches, so its
 * window is seconds to minutes.
 *
 * A rotating counter answers that. A caller captures `current()` before its
 * first `await` and checks `isCurrent()` before it writes; a write from a
 * superseded session is dropped rather than blended. The token is branded for
 * the same reason `GatePass` is — a plain number invites a call site to
 * "helpfully" pass `0`.
 *
 * This module is deliberately dependency-free (only the logger), so anything
 * can import it. The clearing orchestration that a *full* account switch also
 * needs lives in `accountSession.svelte.ts`, which reaches four stores and the
 * paper service; a mode switch only needs to rotate, and importing the
 * orchestrator from `paperTradingService` would close an import cycle
 * (`accountSession` already imports `paperTradingService`).
 */

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
export type RotationReason = "account-switch" | "venue-switch" | "mode-switch";

export class AccountEpochStore {
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
     * Separate from `accountSession.reset()` so the ordering there can be
     * deliberate; see the note on that method.
     */
    rotate(reason: RotationReason): void {
        this.seq += 1;
        logger.log("governance", `[AccountSession] rotated to ${this.seq}`, { reason });
    }
}

export const accountEpoch = new AccountEpochStore();
