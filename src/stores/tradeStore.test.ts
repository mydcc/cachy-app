
import { describe, it, expect, vi, beforeEach } from "vitest";
import { tradeState, INITIAL_TRADE_STATE } from "./trade.svelte";
import { Decimal } from "decimal.js";

// Mock browser
vi.mock("$app/environment", () => ({
    browser: true,
    dev: true
}));

describe("Trade Store Integration", () => {

    beforeEach(() => {
        // Reset to clean state before each test
        tradeState.resetInputs(false, false);
    });

    it("should reset remote fields to undefined", () => {
        // Set values that should be reset
        tradeState.remoteLeverage = new Decimal(50);
        tradeState.remoteMarginMode = "isolated";

        expect(tradeState.remoteLeverage).toBeDefined();
        expect(tradeState.remoteMarginMode).toBeDefined();

        // Perform reset
        tradeState.resetInputs();

        // Verify reset
        expect(tradeState.remoteLeverage).toBeUndefined();
        expect(tradeState.remoteMarginMode).toBeUndefined();

        // Verify defaults are preserved where expected
        expect(tradeState.symbol).toBe("BTCUSDT"); // default
    });

    it("should preserve symbol if requested", () => {
        tradeState.setSymbol("ETHUSDT");
        tradeState.resetInputs(true); // preserveSymbol=true
        expect(tradeState.symbol).toBe("ETHUSDT");
    });
});
