/*
 * BUG-0593: the AI prompt row for a journal trade must carry the exact PnL,
 * not a float64 collapse of it. `toRecentTradeEntry` keeps the Decimal as a
 * string (like the neighboring `openPositions` payload) and derives `won`
 * with `Decimal.gt`.
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { toRecentTradeEntry } from "./ai.svelte";
import type { JournalEntry } from "./types";

function entry(profit: Decimal.Value): JournalEntry {
    return {
        symbol: "BTCUSDT",
        entryDate: "2026-01-01T00:00:00.000Z",
        exitDate: "2026-01-02T00:00:00.000Z",
        totalNetProfit: new Decimal(profit),
    } as JournalEntry;
}

describe("toRecentTradeEntry", () => {
    it("keeps high-precision PnL exact instead of collapsing through float64", () => {
        // 9007199254740993 is not representable as a double; `.toNumber()`
        // silently rounded it to 9007199254740992 before the prompt saw it.
        const row = toRecentTradeEntry(entry("9007199254740993"));

        expect(typeof row.pnl).toBe("string");
        expect(row.pnl).toBe("9007199254740993");
        expect(row.won).toBe(true);
    });

    it("marks losers and zero PnL as not won", () => {
        expect(toRecentTradeEntry(entry("-12.5"))).toMatchObject({ pnl: "-12.5", won: false });
        expect(toRecentTradeEntry(entry(0))).toMatchObject({ pnl: "0", won: false });
    });
});
