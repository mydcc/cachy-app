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
 * Account read ordering — BUG-0412.
 *
 * `accountSession` (FEAT-0026) answers *which account* a read belongs to. It
 * does not answer *which read* — inside one session `isCurrent()` is true for
 * a stale response and a fresh one alike, so the account snapshot was
 * last-landing-wins.
 *
 * That is not a theoretical ordering concern. The sidebar mounts twice
 * (desktop and mobile; the CSS-hidden one is still mounted and still
 * fetches), each instance reads on mount *and* on a credentials change, and
 * `tradeService.fetchPositionMode` reads independently for the mode chip.
 * Observed live: five identical `/api/account` POSTs within 1.25 s of a
 * reload, and a fresh `ONE_WAY` body in the network panel next to a `HEDGE`
 * chip — the pre-write response had landed last and overwritten the
 * post-write one. A trader then sizes and arms against a position mode the
 * exchange no longer has.
 *
 * The fix is a monotonic issue counter. A reader takes a ticket *before* its
 * first `await` and asks `mayApply()` before it writes; a response whose
 * ticket is older than the newest one already applied is dropped. The session
 * check is folded in, so a call site cannot satisfy one guard and forget the
 * other.
 *
 * Deliberately global rather than per-call-site: the whole point is that the
 * competing reads live in *different* components and services, all writing
 * the same store. A counter scoped to one instance is the per-instance lock
 * that already exists and that already fails to help across instances.
 *
 * This orders writes; it does not stop the duplicate requests themselves.
 * Coalescing overlapping reads into one round trip is tracked separately —
 * it is a traffic concern, this is the correctness one.
 */

import { accountSession, type AccountSession } from "./accountSession.svelte";

declare const ticketBrand: unique symbol;

/**
 * Proof of *when* a read was issued, relative to every other account read.
 *
 * Branded for the same reason `AccountSession` is: a plain number invites a
 * call site to pass one it did not take, which is exactly the mistake the
 * ticket exists to make impossible.
 */
export interface AccountReadTicket {
    readonly [ticketBrand]: true;
    readonly seq: number;
    readonly session: AccountSession;
}

class AccountReadOrder {
    /** Tickets handed out so far. Monotonic for the life of the tab. */
    private issued = 0;

    /** The newest ticket whose result actually reached a store. */
    private applied = 0;

    /**
     * Take a ticket for a read about to start.
     *
     * Must be called *before* the first `await`, so the ticket records the
     * moment the read was issued rather than the moment it came back — the
     * latter is the arrival order, which is the thing that cannot be trusted.
     */
    begin(): AccountReadTicket {
        this.issued += 1;
        return {
            seq: this.issued,
            session: accountSession.current(),
        } as unknown as AccountReadTicket;
    }

    /**
     * Whether this read's result may still be written, and claim the slot.
     *
     * Returns false when the account was switched under the read (the
     * FEAT-0026 case) or when a read issued *later* has already landed. Calling
     * it marks the ticket as applied, so a caller must ask once, immediately
     * before writing — not as a precondition it re-checks.
     */
    mayApply(ticket: AccountReadTicket): boolean {
        if (!accountSession.isCurrent(ticket.session)) return false;
        if (ticket.seq <= this.applied) return false;
        this.applied = ticket.seq;
        return true;
    }
}

/**
 * The `/api/account` snapshot lane — `positionMode`, balances.
 */
export const accountReadOrder = new AccountReadOrder();

/**
 * The `/api/leverage-margin-mode` lane — leverage and margin mode.
 *
 * A separate counter, deliberately. Ordering answers "is this answer older
 * than one already applied *to this field*"; the two endpoints describe
 * different fields, so a snapshot read must not be able to hold back a
 * leverage read that started after it. Sharing one counter would do exactly
 * that, and the symptom would look like the bug this fixes.
 *
 * Keeping the two halves of the chip *consistent with each other* is a
 * different question with a different answer (BUG-0409); it is not ordering.
 */
export const leverageReadOrder = new AccountReadOrder();
