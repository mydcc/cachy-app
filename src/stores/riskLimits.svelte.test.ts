// @vitest-environment happy-dom
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

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("$app/env", () => ({ browser: true, dev: true }));

import { riskState } from "./riskLimits.svelte";
import { CONSTANTS } from "../lib/constants";

function writeLegacy(blob: Record<string, unknown>): void {
    localStorage.setItem(CONSTANTS.LOCAL_STORAGE_RISK_KEY, JSON.stringify(blob));
}

beforeEach(() => {
    localStorage.clear();
    riskState.reloadFromStorage();
    riskState.resetLimits();
    riskState.setKillSwitchOption("blockAdds", true);
    riskState.setKillSwitchOption("blockNonTpSlModifies", true);
    riskState.setKillSwitchOption("confirmEngage", true);
    riskState.setKillSwitchOption("autoEngageDailyLossUsdt", null);
});

afterEach(() => {
    localStorage.clear();
    riskState.reloadFromStorage();
    riskState.resetLimits();
});

describe("FEAT-0526 — kill-switch config persistence", () => {
    it("reads defaults from a blob written before the config existed", () => {
        writeLegacy({ limits: {}, killSwitchEngagedAt: null, lastHistorySyncAt: null });
        riskState.reloadFromStorage();

        expect(riskState.killSwitchConfig).toEqual({
            blockAdds: true,
            blockNonTpSlModifies: true,
            confirmEngage: true,
            autoEngageDailyLossUsdt: null,
        });
    });

    it("keeps a stored false after a reload", () => {
        riskState.setKillSwitchOption("blockAdds", false);
        riskState.reloadFromStorage();

        expect(riskState.killSwitchConfig.blockAdds).toBe(false);
        expect(riskState.killSwitchConfig.blockNonTpSlModifies).toBe(true);
    });

    it("fills only the missing keys of a partial blob", () => {
        writeLegacy({
            limits: {},
            killSwitchEngagedAt: null,
            lastHistorySyncAt: null,
            killSwitch: { blockNonTpSlModifies: false },
        });
        riskState.reloadFromStorage();

        expect(riskState.killSwitchConfig.blockAdds).toBe(true);
        expect(riskState.killSwitchConfig.blockNonTpSlModifies).toBe(false);
        expect(riskState.killSwitchConfig.confirmEngage).toBe(true);
    });

    it("accepts a positive threshold and persists it", () => {
        expect(riskState.setKillSwitchOption("autoEngageDailyLossUsdt", "250")).toBe(true);
        expect(riskState.killSwitchAutoEngageLimit()?.toString()).toBe("250");

        riskState.reloadFromStorage();
        expect(riskState.killSwitchConfig.autoEngageDailyLossUsdt).toBe("250");
    });

    it("rejects zero, negatives and non-numbers", () => {
        for (const value of ["0", "-5", "abc"]) {
            expect(riskState.setKillSwitchOption("autoEngageDailyLossUsdt", value)).toBe(false);
        }
        expect(riskState.killSwitchConfig.autoEngageDailyLossUsdt).toBeNull();
    });

    it("clears the threshold with an empty string", () => {
        riskState.setKillSwitchOption("autoEngageDailyLossUsdt", "100");
        expect(riskState.setKillSwitchOption("autoEngageDailyLossUsdt", "")).toBe(true);
        expect(riskState.killSwitchAutoEngageLimit()).toBeNull();
    });

    it("resetLimits does not weaken the switch configuration", () => {
        riskState.setKillSwitchOption("blockAdds", false);
        riskState.setKillSwitchOption("autoEngageDailyLossUsdt", "100");

        riskState.resetLimits();

        expect(riskState.killSwitchConfig.blockAdds).toBe(false);
        expect(riskState.killSwitchConfig.autoEngageDailyLossUsdt).toBe("100");
    });

    it("records the UTC day of a manual release and survives a reload", () => {
        const now = Date.UTC(2026, 9, 28, 22, 0, 0);
        riskState.engageKillSwitch(now);
        riskState.releaseKillSwitch({ confirmed: true }, now);

        expect(riskState.killSwitchAutoEngageSuppressedFor).toBe(Date.UTC(2026, 9, 28));

        riskState.reloadFromStorage();
        expect(riskState.killSwitchAutoEngageSuppressedFor).toBe(Date.UTC(2026, 9, 28));
    });
});
