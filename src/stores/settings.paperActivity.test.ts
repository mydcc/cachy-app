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

/*
 * FEAT-0327 — a paper account is an account to show.
 *
 * `effectiveShowSidebarActivity` gates the Market Activity panel on "does a
 * venue know us", which was the same question as "is there anything to show"
 * until paper trading existed. It stopped being the same question: someone
 * practising before funding an account has positions, orders and a balance,
 * and the panel this feature exists to be watched in was hidden from exactly
 * the people using it.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("$app/environment", () => ({ browser: true }));

vi.mock("../services/cryptoService", () => ({
    cryptoService: {
        unlockSession: vi.fn().mockResolvedValue(true),
        lockSession: vi.fn(),
        isUnlocked: vi.fn().mockReturnValue(true),
        encrypt: vi.fn(),
        decrypt: vi.fn(),
        hasStoredSecrets: vi.fn().mockReturnValue(false),
    },
}));

import { SettingsManager } from "./settings.svelte";
import { paperState } from "./paperTrading.svelte";

let settings: SettingsManager;

beforeEach(() => {
    localStorage.clear();
    paperState.reloadFromStorage();
    settings = new SettingsManager();
    settings.showSidebarActivity = true;
    settings.apiProvider = "bitunix";
    settings.apiKeys = {
        ...settings.apiKeys,
        bitunix: { key: "", secret: "" },
    };
});

describe("the Market Activity panel's gate", () => {
    it("stays hidden with no credentials and no paper mode", () => {
        paperState.setEnabled(false);
        expect(settings.effectiveShowSidebarActivity).toBe(false);
    });

    it("shows for a paper account with no credentials at all", () => {
        paperState.setEnabled(true);
        try {
            // The simulated book needs no venue to authenticate against, and
            // it is the only place a paper position can be watched, closed or
            // given a stop.
            expect(settings.effectiveShowSidebarActivity).toBe(true);
        } finally {
            paperState.setEnabled(false);
        }
    });

    it("still respects the user's own switch", () => {
        paperState.setEnabled(true);
        try {
            settings.showSidebarActivity = false;
            expect(settings.effectiveShowSidebarActivity).toBe(false);
        } finally {
            paperState.setEnabled(false);
        }
    });

    it("still shows for a live account with credentials", () => {
        paperState.setEnabled(false);
        settings.apiKeys = {
            ...settings.apiKeys,
            bitunix: { key: "a-real-key", secret: "a-real-secret" },
        };
        expect(settings.effectiveShowSidebarActivity).toBe(true);
    });
});
