
import { describe, it, expect, beforeEach } from "vitest";
import { aiState } from "./ai.svelte";
import { tradeState } from "./trade.svelte";

describe("AI Robustness", () => {
    beforeEach(() => {
        tradeState.resetInputs();
        tradeState.entryPrice = 100;
    });

    it("should ignore NaN values for setEntryPrice", () => {
        // Access private method via casting
        const ai = aiState as any;

        // Try to set invalid price
        ai.executeAction({ action: "setEntryPrice", value: "abc" }, false);

        // Should remain 100
        expect(tradeState.entryPrice).toBe(100);

        // Try to set valid price
        ai.executeAction({ action: "setEntryPrice", value: "200" }, false);
        expect(tradeState.entryPrice).toBe(200);
    });

    it("should ignore NaN values for setStopLoss", () => {
        const ai = aiState as any;
        tradeState.stopLossPrice = 90;

        ai.executeAction({ action: "setStopLoss", value: "xyz" }, false);
        expect(tradeState.stopLossPrice).toBe(90);

        ai.executeAction({ action: "setStopLoss", value: "95" }, false);
        expect(tradeState.stopLossPrice).toBe(95);
    });

    it("should ignore NaN values for setTakeProfit", () => {
        const ai = aiState as any;
        // Targets are array. Index 0.
        tradeState.targets[0].price = 110;

        ai.executeAction({ action: "setTakeProfit", index: 0, value: "invalid" }, false);
        expect(tradeState.targets[0].price).toBe(110);

        ai.executeAction({ action: "setTakeProfit", index: 0, value: "120" }, false);
        expect(tradeState.targets[0].price).toBe(120);
    });
});
