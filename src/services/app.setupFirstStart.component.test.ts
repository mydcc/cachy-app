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
 * The first start used to seed a demo entry, ATR and three TP rows. These
 * tests pin the two halves of the fix: a fresh profile starts from the store
 * defaults, and an untouched legacy seed is cleared exactly once. The
 * component project is required because `setupFirstStart` returns early when
 * `$app/env.browser` is false, as it is in the unit project.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tradeState, INITIAL_TRADE_STATE } from "../stores/trade.svelte";
import { app } from "./app";

const INIT_KEY = "cachy_init_v501";
const CLEANUP_KEY = "cachy_demo_seed_cleaned_v1";

function resetTradeState() {
    tradeState.set(JSON.parse(JSON.stringify(INITIAL_TRADE_STATE)));
}

function seedLegacyDemo() {
    tradeState.update((state) => ({
        ...state,
        entryPrice: "88480.2",
        atrValue: "45.5",
        targets: [
            { price: "120000", percent: "50", isLocked: false },
            { price: "122000", percent: "25", isLocked: false },
            { price: "124000", percent: "25", isLocked: false },
        ],
    }));
}

describe("app.setupFirstStart", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        localStorage.clear();
        resetTradeState();
        vi.spyOn(app, "calculateAndDisplay").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.restoreAllMocks();
        localStorage.clear();
    });

    it("starts with no demo entry/ATR and a single 100% TP row", () => {
        app.setupFirstStart();

        expect(tradeState.entryPrice).toBeNull();
        expect(tradeState.atrValue).toBeNull();
        expect(tradeState.targets).toHaveLength(1);
        expect(tradeState.targets[0].price).toBeNull();
        expect(tradeState.targets[0].percent).toBe("100");
        expect(localStorage.getItem(INIT_KEY)).toBe("true");
    });

    it("cleans an untouched legacy demo seed for existing profiles", () => {
        localStorage.setItem(INIT_KEY, "true");
        seedLegacyDemo();

        app.setupFirstStart();

        expect(tradeState.entryPrice).toBeNull();
        expect(tradeState.atrValue).toBeNull();
        expect(tradeState.targets).toHaveLength(1);
        expect(tradeState.targets[0].percent).toBe("100");
        expect(localStorage.getItem(CLEANUP_KEY)).toBe("true");
    });

    it("keeps a profile whose demo values were edited", () => {
        localStorage.setItem(INIT_KEY, "true");
        seedLegacyDemo();
        tradeState.update((state) => ({ ...state, entryPrice: "90000" }));

        app.setupFirstStart();

        expect(tradeState.entryPrice).toBe("90000");
        expect(tradeState.targets).toHaveLength(3);
    });

    it("cleans only once, so a later identical entry is left alone", () => {
        localStorage.setItem(INIT_KEY, "true");
        seedLegacyDemo();
        app.setupFirstStart();
        seedLegacyDemo();

        app.setupFirstStart();

        expect(tradeState.entryPrice).toBe("88480.2");
        expect(tradeState.targets).toHaveLength(3);
    });
});
