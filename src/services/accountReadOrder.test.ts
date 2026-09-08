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
 * BUG-0412 — the ordering guard in isolation.
 *
 * PositionsSidebar.race.component.test.ts pins the behaviour through the real
 * component; this pins the contract the component relies on, including the
 * one case that test cannot reach (an account switch mid-read).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { accountReadOrder } from "./accountReadOrder";
import { accountSession } from "./accountSession.svelte";

describe("accountReadOrder", () => {
    beforeEach(() => {
        // Every test starts from whatever the previous one left behind — the
        // counter is deliberately global and monotonic, so the assertions
        // below are all relative, never absolute.
        vi.clearAllMocks();
    });

    it("applies a response from the newest read", () => {
        const ticket = accountReadOrder.begin();
        expect(accountReadOrder.mayApply(ticket)).toBe(true);
    });

    it("drops a read that was issued before one already applied", () => {
        const stale = accountReadOrder.begin();
        const fresh = accountReadOrder.begin();

        expect(accountReadOrder.mayApply(fresh)).toBe(true);
        expect(accountReadOrder.mayApply(stale)).toBe(false);
    });

    it("still applies a later read after an earlier one landed first", () => {
        const first = accountReadOrder.begin();
        const second = accountReadOrder.begin();

        expect(accountReadOrder.mayApply(first)).toBe(true);
        expect(accountReadOrder.mayApply(second)).toBe(true);
    });

    it("refuses a ticket a second time", () => {
        const ticket = accountReadOrder.begin();

        expect(accountReadOrder.mayApply(ticket)).toBe(true);
        expect(accountReadOrder.mayApply(ticket)).toBe(false);
    });

    it("drops a read whose account was switched under it (FEAT-0026)", () => {
        const ticket = accountReadOrder.begin();
        accountSession.rotate("account-switch");

        expect(accountReadOrder.mayApply(ticket)).toBe(false);
    });

    it("keeps ordering intact across a rotation", () => {
        accountSession.rotate("venue-switch");
        const stale = accountReadOrder.begin();
        const fresh = accountReadOrder.begin();

        expect(accountReadOrder.mayApply(fresh)).toBe(true);
        expect(accountReadOrder.mayApply(stale)).toBe(false);
    });
});
