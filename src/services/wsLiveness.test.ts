/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
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
 * BUG-0565 / IDEA-0563 — freshness is connection liveness, not wall-clock age.
 *
 * Live has no balance poll: the USDT balance reaches the store only by WS
 * push, so an age gate would refuse valid trades on untouched accounts.
 * Instead the balance stops being trusted when the authenticated stream
 * behind it dies. These tests pin the teardown hooks: private teardown
 * demotes, public teardown does not, and a paper snapshot is never demoted
 * by a socket event.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { accountState } from "../stores/account.svelte";
import { bitunixWs } from "./bitunixWs";
import { bitgetWs } from "./bitgetWs";

interface BitunixTeardown {
    cleanup(type: "public" | "private"): void;
}

interface BitgetTeardown {
    cleanup(): void;
}

function liveBalance() {
    accountState.hydrateBalance({ available: "500", margin: "0", frozen: "0" }, "live");
}

function paperBalance() {
    accountState.hydrateBalance({ available: "10000", margin: "0", frozen: "0" }, "paper");
}

describe("WS liveness demotes the balance (BUG-0565 / IDEA-0563)", () => {
    beforeEach(() => {
        accountState.reset();
    });

    it("bitunix private teardown demotes a live measurement", () => {
        liveBalance();
        (bitunixWs as unknown as BitunixTeardown).cleanup("private");

        expect(accountState.readUsdtBalance("live")).toBeUndefined();
        // Kept for display — demote is about trust, not deletion.
        expect(accountState.assets.find((a) => a.currency === "USDT")?.available.toString()).toBe(
            "500",
        );
    });

    it("bitunix public teardown does not demote", () => {
        liveBalance();
        (bitunixWs as unknown as BitunixTeardown).cleanup("public");

        expect(accountState.readUsdtBalance("live")?.available.toString()).toBe("500");
    });

    it("bitget teardown demotes a live measurement", () => {
        liveBalance();
        (bitgetWs as unknown as BitgetTeardown).cleanup();

        expect(accountState.readUsdtBalance("live")).toBeUndefined();
    });

    it("teardown never demotes a paper snapshot", () => {
        paperBalance();
        (bitunixWs as unknown as BitunixTeardown).cleanup("private");
        expect(accountState.readUsdtBalance("paper")?.available.toString()).toBe("10000");

        (bitgetWs as unknown as BitgetTeardown).cleanup();
        expect(accountState.readUsdtBalance("paper")?.available.toString()).toBe("10000");
    });
});
