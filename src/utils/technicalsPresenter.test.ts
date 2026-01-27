
import { describe, it, expect } from "vitest";
import { TechnicalsPresenter } from "./technicalsPresenter";
import { Decimal } from "decimal.js";

describe("TechnicalsPresenter", () => {
    describe("calculateBollingerBandWidth", () => {
        it("should calculate correct width percentage", () => {
            // (Upper - Lower) / Middle * 100
            // (110 - 90) / 100 * 100 = 20 / 100 * 100 = 20%
            const upper = new Decimal(110);
            const lower = new Decimal(90);
            const middle = new Decimal(100);

            const result = TechnicalsPresenter.calculateBollingerBandWidth(upper, lower, middle);
            expect(result.toNumber()).toBe(20);
        });

        it("should return 0 if middle is 0", () => {
            const result = TechnicalsPresenter.calculateBollingerBandWidth(new Decimal(10), new Decimal(5), new Decimal(0));
            expect(result.toNumber()).toBe(0);
        });
    });

    describe("getOscillatorContext", () => {
        it("should return Overbought for RSI >= 70", () => {
            const result = TechnicalsPresenter.getOscillatorContext("RSI", new Decimal(70));
            expect(result).toBe("Overbought");
        });

        it("should return Oversold for RSI <= 30", () => {
            const result = TechnicalsPresenter.getOscillatorContext("RSI", new Decimal(30));
            expect(result).toBe("Oversold");
        });

        it("should return Neutral for RSI 50", () => {
            const result = TechnicalsPresenter.getOscillatorContext("RSI", new Decimal(50));
            expect(result).toBe("Neutral"); // Default fallback
        });

        it("should return Overbought for Stoch >= 80", () => {
            const result = TechnicalsPresenter.getOscillatorContext("Stoch", new Decimal(80));
            expect(result).toBe("Overbought");
        });
    });

    describe("getActionColor", () => {
        it("should return success color for Buy actions", () => {
            expect(TechnicalsPresenter.getActionColor("Buy")).toContain("success-color");
            expect(TechnicalsPresenter.getActionColor("Strong Buy")).toContain("#00ff88");
        });

        it("should return danger color for Sell actions", () => {
            expect(TechnicalsPresenter.getActionColor("Sell")).toContain("danger-color");
            expect(TechnicalsPresenter.getActionColor("Strong Sell")).toContain("#ff0044");
        });
    });

    describe("formatVal", () => {
        it("should format decimal correctly", () => {
            expect(TechnicalsPresenter.formatVal(new Decimal(123.456789), 2)).toBe("123.46");
        });

        it("should return '-' for undefined", () => {
            expect(TechnicalsPresenter.formatVal(undefined)).toBe("-");
        });
    });
});
