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
 * BUG-0409 — the position mode carries the moment it was confirmed.
 *
 * The mode chip pairs this field with a margin mode refreshed by entirely
 * different triggers. Without a stamp on this side there is no way to tell
 * that the two halves describe different moments, which is how the chip came
 * to show a combination no venue had ever reported.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { accountState } from "./account.svelte";

describe("accountState.setPositionMode", () => {
    beforeEach(() => {
        accountState.reset();
    });

    it("stamps the moment a read confirmed the mode", () => {
        const before = Date.now();
        accountState.setPositionMode("HEDGE");

        expect(accountState.positionMode).toBe("HEDGE");
        expect(accountState.positionModeAt).toBeGreaterThanOrEqual(before);
    });

    it("treats an empty answer as no mode at all", () => {
        // The venue reporting nothing is not the venue reporting "".
        accountState.setPositionMode("");

        expect(accountState.positionMode).toBeUndefined();
        expect(accountState.positionModeAt).toBeDefined();
    });

    it("stamps a mode the venue no longer reports, because that read happened", () => {
        accountState.setPositionMode("HEDGE");
        const first = accountState.positionModeAt;

        accountState.setPositionMode(undefined);

        expect(accountState.positionMode).toBeUndefined();
        expect(accountState.positionModeAt).toBeGreaterThanOrEqual(first as number);
    });

    it("starts unstamped and unstamps again on an account switch", () => {
        expect(accountState.positionModeAt).toBeUndefined();

        accountState.setPositionMode("ONE_WAY");
        accountState.reset();

        // A stamp that survived the switch would date the previous account's
        // answer as if it described the new one.
        expect(accountState.positionModeAt).toBeUndefined();
        expect(accountState.positionMode).toBeUndefined();
    });
});

/*
 * The encapsulation itself, not the stamping behaviour above.
 *
 * A getter without a setter is what turns "write through setPositionMode"
 * from a convention into a rule the runtime enforces — including the alias
 * form (`const s = accountState; s.positionMode = x`) that the CI text scan
 * in FEAT-0417 cannot see. Without this test, turning the getter back into a
 * plain field would restore the old hazard silently.
 */
describe("the stamped fields cannot be written from outside the store", () => {
    it("refuses a direct assignment to positionMode", () => {
        accountState.setPositionMode("HEDGE");
        expect(() => {
            (accountState as unknown as { positionMode: string }).positionMode = "ONE_WAY";
        }).toThrow(TypeError);
        expect(accountState.positionMode).toBe("HEDGE");
    });

    it("refuses a direct assignment to positionModeAt", () => {
        accountState.setPositionMode("HEDGE");
        const stamped = accountState.positionModeAt;
        expect(() => {
            (accountState as unknown as { positionModeAt: number }).positionModeAt = 0;
        }).toThrow(TypeError);
        expect(accountState.positionModeAt).toBe(stamped);
    });

    it("refuses an assignment made through an alias, which no text scan catches", () => {
        accountState.setPositionMode("HEDGE");
        const alias = accountState as unknown as { positionMode: string };
        expect(() => {
            alias.positionMode = "ONE_WAY";
        }).toThrow(TypeError);
        expect(accountState.positionMode).toBe("HEDGE");
    });
});
