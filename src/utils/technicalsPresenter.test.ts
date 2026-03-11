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

import { describe, it, expect } from "vitest";
import { TechnicalsPresenter } from "./technicalsPresenter";
import { Decimal } from "decimal.js";

describe("TechnicalsPresenter", () => {
    describe("getOscillatorContext", () => {
        it("should return Overbought for RSI >= 70", () => {
            expect(TechnicalsPresenter.getOscillatorContext("RSI", 70)).toBe("Overbought");
            expect(TechnicalsPresenter.getOscillatorContext("RSI", 75)).toBe("Overbought");
        });

        it("should return Oversold for RSI <= 30", () => {
            expect(TechnicalsPresenter.getOscillatorContext("RSI", 30)).toBe("Oversold");
            expect(TechnicalsPresenter.getOscillatorContext("RSI", 25)).toBe("Oversold");
        });

        it("should return Neutral for RSI 50", () => {
            expect(TechnicalsPresenter.getOscillatorContext("RSI", 50)).toBe("Neutral");
        });

        it("should return Overbought for Stoch >= 80", () => {
            expect(TechnicalsPresenter.getOscillatorContext("Stoch", 80)).toBe("Overbought");
        });
    });

    describe("getActionColor", () => {
        it("should return success color for Buy actions", () => {
            expect(TechnicalsPresenter.getActionColor("Buy")).toContain("var(--success-color)");
            expect(TechnicalsPresenter.getActionColor("Strong Buy")).toContain("#00ff88");
        });

        it("should return danger color for Sell actions", () => {
            expect(TechnicalsPresenter.getActionColor("Sell")).toContain("var(--danger-color)");
            expect(TechnicalsPresenter.getActionColor("Strong Sell")).toContain("#ff0044");
        });
    });

    describe("formatVal", () => {
        it("should format decimal correctly", () => {
            expect(TechnicalsPresenter.formatVal(123.45678, 2)).toBe("123.46");
        });

        it("should return '-' for undefined", () => {
            expect(TechnicalsPresenter.formatVal(undefined)).toBe("-");
        });
    });

    describe("calculateBollingerBandWidth", () => {
        it("should calculate correct width percentage", () => {
            const upper = 120;
            const lower = 100;
            const middle = 110;
            // (20 / 110) * 100 = 18.1818...
            const result = TechnicalsPresenter.calculateBollingerBandWidth(upper, lower, middle);
            expect(result).toBeCloseTo(18.1818, 2);
        });

        it("should return 0 if middle is 0", () => {
            const result = TechnicalsPresenter.calculateBollingerBandWidth(10, 5, 0);
            expect(result).toBe(0);
        });
    });
});
