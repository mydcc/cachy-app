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
import { Decimal } from "decimal.js";
import {
    addQuantityFromPercent,
    percentFromAddQuantity,
    previewAdd,
    requiredMargin,
    roundAddQuantityToStep,
    type AddToPositionContext,
} from "./addToPosition";

const d = (v: string | number) => new Decimal(v);

/** A 1 BTC long at 30 000, marking 28 000, step 0.001. */
function longCtx(over: Partial<AddToPositionContext> = {}): AddToPositionContext {
    return {
        positionAmount: d(1),
        entryPrice: d(30_000),
        markPrice: d(28_000),
        side: "LONG",
        stepSize: d("0.001"),
        ...over,
    };
}

/** A 1 BTC short at 30 000, marking 32 000, step 0.001. */
function shortCtx(over: Partial<AddToPositionContext> = {}): AddToPositionContext {
    return {
        positionAmount: d(1),
        entryPrice: d(30_000),
        markPrice: d(32_000),
        side: "SHORT",
        stepSize: d("0.001"),
        ...over,
    };
}

describe("previewAdd — the average entry after scaling in", () => {
    it("averages a long's entry down when the add fills below it", () => {
        // 1 @ 30 000 plus 1 @ 28 000 → 2 @ 29 000.
        const preview = previewAdd(longCtx(), d(1), d(28_000));

        expect(preview).not.toBeNull();
        expect(preview!.resultingAmount.equals(d(2))).toBe(true);
        expect(preview!.resultingEntryPrice.equals(d(29_000))).toBe(true);
        expect(preview!.entryShift.equals(d(-1000))).toBe(true);
        // A long's entry falling is an improvement, not a warning.
        expect(preview!.worsensEntry).toBe(false);
    });

    it("averages a long's entry up when the add fills above it", () => {
        // 1 @ 30 000 plus 1 @ 34 000 → 2 @ 32 000.
        const preview = previewAdd(longCtx(), d(1), d(34_000));

        expect(preview!.resultingEntryPrice.equals(d(32_000))).toBe(true);
        expect(preview!.entryShift.equals(d(2000))).toBe(true);
        expect(preview!.worsensEntry).toBe(true);
    });

    it("averages a short's entry up when the add fills above it", () => {
        // 1 @ 30 000 plus 1 @ 32 000 → 2 @ 31 000. A short wants a higher
        // average entry, so this is the improving direction for a short.
        const preview = previewAdd(shortCtx(), d(1), d(32_000));

        expect(preview!.resultingAmount.equals(d(2))).toBe(true);
        expect(preview!.resultingEntryPrice.equals(d(31_000))).toBe(true);
        expect(preview!.entryShift.equals(d(1000))).toBe(true);
        expect(preview!.worsensEntry).toBe(false);
    });

    it("flags a short whose average entry falls as the worse direction", () => {
        const preview = previewAdd(shortCtx(), d(1), d(26_000));

        expect(preview!.resultingEntryPrice.equals(d(28_000))).toBe(true);
        expect(preview!.entryShift.equals(d(-2000))).toBe(true);
        expect(preview!.worsensEntry).toBe(true);
    });

    it("weights the add by its size, not merely by its price", () => {
        // 1 @ 30 000 plus 3 @ 26 000 → 4 @ 27 000, not the midpoint 28 000.
        const preview = previewAdd(longCtx(), d(3), d(26_000));

        expect(preview!.resultingAmount.equals(d(4))).toBe(true);
        expect(preview!.resultingEntryPrice.equals(d(27_000))).toBe(true);
    });

    it("keeps precision a float would lose", () => {
        // 0.1 + 0.2 in binary floating point is 0.30000000000000004, and an
        // average entry computed that way is a wrong stop distance.
        const ctx = longCtx({ positionAmount: d("0.1"), entryPrice: d("0.3") });
        const preview = previewAdd(ctx, d("0.2"), d("0.3"));

        expect(preview!.resultingAmount.equals(d("0.3"))).toBe(true);
        expect(preview!.resultingEntryPrice.equals(d("0.3"))).toBe(true);
        expect(preview!.entryShift.isZero()).toBe(true);
    });

    it("has nothing to preview for a non-positive add or price", () => {
        expect(previewAdd(longCtx(), d(0), d(28_000))).toBeNull();
        expect(previewAdd(longCtx(), d(-1), d(28_000))).toBeNull();
        expect(previewAdd(longCtx(), d(1), d(0))).toBeNull();
        expect(previewAdd(longCtx(), d(1), new Decimal(NaN))).toBeNull();
    });
});

describe("addQuantityFromPercent", () => {
    it("measures the percentage against the position held now", () => {
        // 100 % doubles the position; 50 % adds half of it again.
        expect(addQuantityFromPercent(longCtx(), d(100)).equals(d(1))).toBe(true);
        expect(addQuantityFromPercent(longCtx(), d(50)).equals(d("0.5"))).toBe(true);
    });

    it("rounds down to the step, never up", () => {
        // 33 % of 1 is 0.33; with a step of 0.1 the fillable quantity is 0.3.
        const ctx = longCtx({ stepSize: d("0.1") });
        expect(addQuantityFromPercent(ctx, d(33)).equals(d("0.3"))).toBe(true);
    });

    it("falls back to one step rather than to zero", () => {
        // 1 % of 0.05 is 0.0005, below a step of 0.001. Zero is not an order.
        const ctx = longCtx({ positionAmount: d("0.05") });
        expect(addQuantityFromPercent(ctx, d(1)).equals(d("0.001"))).toBe(true);
    });

    it("adds nothing at or below zero percent", () => {
        expect(addQuantityFromPercent(longCtx(), d(0)).isZero()).toBe(true);
        expect(addQuantityFromPercent(longCtx(), d(-10)).isZero()).toBe(true);
    });

    it("has no position ceiling — a percentage above 100 keeps scaling", () => {
        // Unlike the reduce side, nothing clamps an add to the position size.
        expect(addQuantityFromPercent(longCtx(), d(250)).equals(d("2.5"))).toBe(true);
    });

    it("always yields a quantity the venue can fill", () => {
        /*
         * The property the add dialog's default depends on, stated as one.
         *
         * The dialog seeds itself with 25 % of the position, and the gate
         * refuses an add that is not a whole multiple of the step. A position
         * is N x step, so a *raw* quarter is fillable only when N is divisible
         * by four — which is the minority of positions. This function rounds,
         * so the seed is fillable whatever the position happens to be; a
         * regression here would break open-and-press-Add for most traders
         * without breaking any other test.
         */
        const sizes = ["0.0015", "0.05", "0.003", "7", "10", "0.7", "123.456"];
        const precisions = [0, 1, 3, 4, 8];

        for (const size of sizes) {
            for (const precision of precisions) {
                const step = new Decimal(10).pow(-precision);
                const ctx = longCtx({ positionAmount: d(size), stepSize: step });

                for (const percent of [25, 33, 50, 75, 100]) {
                    const qty = addQuantityFromPercent(ctx, d(percent));
                    expect(
                        qty.div(step).isInteger(),
                        `${percent}% of ${size} at step ${step} gave ${qty}, which the venue cannot fill`,
                    ).toBe(true);
                    expect(qty.gt(0)).toBe(true);
                }
            }
        }
    });

    it("round-trips through percentFromAddQuantity", () => {
        const ctx = longCtx();
        const qty = addQuantityFromPercent(ctx, d(75));
        expect(percentFromAddQuantity(ctx, qty).equals(d(75))).toBe(true);
    });

    it("reports zero percent for a position that is not open", () => {
        expect(percentFromAddQuantity(longCtx({ positionAmount: d(0) }), d(1)).isZero()).toBe(true);
    });
});

describe("roundAddQuantityToStep", () => {
    it("rounds down so the add never costs more margin than previewed", () => {
        expect(roundAddQuantityToStep(d("0.1999"), d("0.01")).equals(d("0.19"))).toBe(true);
    });

    it("passes the quantity through when the step is unknown", () => {
        expect(roundAddQuantityToStep(d("0.1999"), d(0)).equals(d("0.1999"))).toBe(true);
    });
});

describe("requiredMargin", () => {
    it("is the notional divided by the leverage", () => {
        // 0.5 BTC at 30 000 is 15 000 notional; at 10× that is 1 500 margin.
        expect(requiredMargin(d("0.5"), d(30_000), d(10)).equals(d(1500))).toBe(true);
    });

    it("assumes no leverage when the account state has not loaded", () => {
        // The conservative reading: the whole notional, not a division by zero.
        expect(requiredMargin(d("0.5"), d(30_000), d(0)).equals(d(15_000))).toBe(true);
    });
});
