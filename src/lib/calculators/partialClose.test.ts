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
    roundDownToStep,
    isWholeMultipleOfStep,
    quantityFromPercent,
    floorCloseQuantity,
    percentFromQuantity,
    remainingAfterClose,
    realizedPnlOnClose,
    isFullClose,
    type PartialCloseContext,
} from "./partialClose";

/** 2 contracts, entered at 100, marked at 110, step 0.001. */
const LONG: PartialCloseContext = {
    positionAmount: new Decimal(2),
    entryPrice: new Decimal(100),
    markPrice: new Decimal(110),
    side: "LONG",
    stepSize: new Decimal("0.001"),
};

const SHORT: PartialCloseContext = { ...LONG, side: "SHORT" };

/**
 * The pathological instrument: a step so coarse that the position is not a
 * whole multiple of it. Real — a step can change, and a partial liquidation
 * leaves whatever it leaves.
 */
const COARSE: PartialCloseContext = {
    ...LONG,
    positionAmount: new Decimal("0.7"),
    stepSize: new Decimal("0.3"),
};

describe("roundDownToStep", () => {
    it("rounds down, never up", () => {
        expect(roundDownToStep(new Decimal("0.29"), new Decimal("0.1")).toString()).toBe("0.2");
        // Nearest would give 0.3 here. Down is deliberate: a reduce that rounds
        // up can exceed the position.
        expect(roundDownToStep(new Decimal("0.28"), new Decimal("0.1")).toString()).toBe("0.2");
    });

    it("leaves an exact multiple alone", () => {
        expect(roundDownToStep(new Decimal("0.5"), new Decimal("0.1")).toString()).toBe("0.5");
    });

    it("passes the quantity through when the step is unknown", () => {
        // Rather than inventing a granularity. The gate still holds the ceiling.
        expect(roundDownToStep(new Decimal("0.1234"), new Decimal(0)).toString()).toBe("0.1234");
        expect(roundDownToStep(new Decimal("0.1234"), new Decimal(-1)).toString()).toBe("0.1234");
    });
});

describe("isWholeMultipleOfStep", () => {
    it("accepts a multiple and rejects a remainder", () => {
        expect(isWholeMultipleOfStep(new Decimal("0.3"), new Decimal("0.1"))).toBe(true);
        expect(isWholeMultipleOfStep(new Decimal("0.35"), new Decimal("0.1"))).toBe(false);
    });

    it("claims nothing when the step is unknown", () => {
        // Refusing every order because metadata has not loaded would be worse
        // than not checking.
        expect(isWholeMultipleOfStep(new Decimal("0.35"), new Decimal(0))).toBe(true);
    });
});

describe("quantityFromPercent", () => {
    it("halves the position at 50%", () => {
        expect(quantityFromPercent(LONG, new Decimal(50)).toString()).toBe("1");
    });

    it("returns the exact position amount at 100%", () => {
        expect(quantityFromPercent(LONG, new Decimal(100)).toString()).toBe("2");
    });

    it("returns the exact position amount at 100% even when it is not a whole step", () => {
        // The case that makes 100% a special path rather than a rounding one:
        // every rounding of 0.7 against a 0.3 step gives 0.6, leaving 0.1 open
        // that the trader never asked to keep.
        expect(quantityFromPercent(COARSE, new Decimal(100)).toString()).toBe("0.7");
    });

    it("rounds a partial quantity down to the step", () => {
        const ctx = { ...LONG, stepSize: new Decimal("0.1") };
        // 33% of 2 = 0.66 → 0.6, not 0.7.
        expect(quantityFromPercent(ctx, new Decimal(33)).toString()).toBe("0.6");
    });

    it("never exceeds the position", () => {
        const qty = quantityFromPercent(COARSE, new Decimal(99));
        expect(qty.lte(COARSE.positionAmount)).toBe(true);
    });

    it("floors at one step rather than zero for a small percentage", () => {
        const ctx = { ...LONG, stepSize: new Decimal("0.1") };
        // 1% of 2 = 0.02 → rounds to 0, which is not an order. One step is the
        // smallest thing the venue accepts.
        expect(quantityFromPercent(ctx, new Decimal(1)).toString()).toBe("0.1");
    });

    it("does not let the one-step floor exceed a position smaller than a step", () => {
        const tiny: PartialCloseContext = {
            ...LONG,
            positionAmount: new Decimal("0.05"),
            stepSize: new Decimal("0.1"),
        };
        expect(quantityFromPercent(tiny, new Decimal(1)).toString()).toBe("0.05");
    });

    it("returns zero at or below 0%", () => {
        expect(quantityFromPercent(LONG, new Decimal(0)).toString()).toBe("0");
        expect(quantityFromPercent(LONG, new Decimal(-5)).toString()).toBe("0");
    });

    it("snaps a partial below the venue minimum up to it", () => {
        const ctx = { ...LONG, minTradeVolume: new Decimal("0.5") };
        // 10% of 2 = 0.2 — step-valid, but the venue would refuse it.
        expect(quantityFromPercent(ctx, new Decimal(10)).toString()).toBe("0.5");
    });

    it("leaves a partial above the venue minimum alone", () => {
        const ctx = { ...LONG, minTradeVolume: new Decimal("0.5") };
        expect(quantityFromPercent(ctx, new Decimal(50)).toString()).toBe("1");
    });

    it("never lets the minimum floor exceed the position itself", () => {
        const tiny: PartialCloseContext = {
            ...LONG,
            positionAmount: new Decimal("0.2"),
            minTradeVolume: new Decimal("0.5"),
        };
        expect(quantityFromPercent(tiny, new Decimal(10)).toString()).toBe("0.2");
    });

    it("keeps the step-only behaviour when no minimum is known", () => {
        const ctx = { ...LONG, stepSize: new Decimal("0.1") };
        // 5% of 2 = 0.1 — above the step floor, untouched with or without a
        // minimum on the context.
        expect(quantityFromPercent(ctx, new Decimal(5)).toString()).toBe("0.1");
    });
});

describe("floorCloseQuantity", () => {
    it("snaps below-minimum quantities up to the venue minimum", () => {
        const ctx = { ...LONG, minTradeVolume: new Decimal("0.5") };
        expect(floorCloseQuantity(ctx, new Decimal("0.2")).toString()).toBe("0.5");
        expect(floorCloseQuantity(ctx, new Decimal("0.7")).toString()).toBe("0.7");
    });

    it("caps the minimum floor at the position itself", () => {
        const tiny: PartialCloseContext = {
            ...LONG,
            positionAmount: new Decimal("0.2"),
            minTradeVolume: new Decimal("0.5"),
        };
        expect(floorCloseQuantity(tiny, new Decimal("0.1")).toString()).toBe("0.2");
    });

    it("falls back to one step for zero without a known minimum", () => {
        const ctx = { ...LONG, stepSize: new Decimal("0.1") };
        expect(floorCloseQuantity(ctx, new Decimal(0)).toString()).toBe("0.1");
        expect(floorCloseQuantity(ctx, new Decimal("0.3")).toString()).toBe("0.3");
    });
});

describe("percentFromQuantity", () => {
    it("inverts quantityFromPercent for a quantity that is a whole step", () => {
        const qty = quantityFromPercent(LONG, new Decimal(50));
        expect(percentFromQuantity(LONG, qty).toString()).toBe("50");
    });

    it("reports 100 for the full amount", () => {
        expect(percentFromQuantity(LONG, LONG.positionAmount).toString()).toBe("100");
    });

    it("does not divide by a zero position", () => {
        const empty = { ...LONG, positionAmount: new Decimal(0) };
        expect(percentFromQuantity(empty, new Decimal(1)).toString()).toBe("0");
    });
});

describe("remainingAfterClose", () => {
    it("reports what stays open", () => {
        expect(remainingAfterClose(LONG, new Decimal("0.5")).toString()).toBe("1.5");
    });

    it("reports zero for a full close, not a negative remainder", () => {
        expect(remainingAfterClose(LONG, new Decimal(2)).toString()).toBe("0");
        expect(remainingAfterClose(LONG, new Decimal(3)).toString()).toBe("0");
    });
});

describe("realizedPnlOnClose", () => {
    it("books a long's gain when the mark is above entry", () => {
        // 1 contract × (110 − 100) = 10.
        expect(realizedPnlOnClose(LONG, new Decimal(1)).toString()).toBe("10");
    });

    it("books a short's loss on the same move", () => {
        expect(realizedPnlOnClose(SHORT, new Decimal(1)).toString()).toBe("-10");
    });

    it("scales with the quantity closed", () => {
        expect(realizedPnlOnClose(LONG, new Decimal(2)).toString()).toBe("20");
        expect(realizedPnlOnClose(LONG, new Decimal("0.5")).toString()).toBe("5");
    });

    it("books a long's loss when the mark is below entry", () => {
        const losing = { ...LONG, markPrice: new Decimal(95) };
        expect(realizedPnlOnClose(losing, new Decimal(1)).toString()).toBe("-5");
    });
});

describe("isFullClose", () => {
    it("is true at the position amount and above", () => {
        expect(isFullClose(LONG, new Decimal(2))).toBe(true);
        expect(isFullClose(LONG, new Decimal(3))).toBe(true);
    });

    it("is false below it", () => {
        expect(isFullClose(LONG, new Decimal("1.999"))).toBe(false);
    });

    it("agrees with quantityFromPercent at 100% on a coarse step", () => {
        // The pair that decides whether `forceFullClose` is set, and therefore
        // what the gate verifies. They must not disagree.
        expect(isFullClose(COARSE, quantityFromPercent(COARSE, new Decimal(100)))).toBe(true);
    });
});

/*
 * FEAT-0573 — the percentage is a share of the size the venue reports *now*.
 *
 * This is the contract the close dialog's labelling rests on: the percentage
 * the handle shows and the quantity it resolves to describe the same slice of
 * the same position, so the two can be shown side by side without either
 * contradicting the other. The arithmetic is unchanged and was already right —
 * these pin it, so a later change to the maths cannot quietly break the claim
 * the UI now makes in words.
 *
 * The round trip is exact where the two quantity rules are both the identity,
 * which is every whole percent of a position that divides cleanly by the step:
 *
 * - step rounding, which on `COARSE` is not the identity — 50 % of 0.7 rounds
 *   down to 0.3 — and
 * - the venue-minimum floor, which snaps a partial *up* to `minTradeVolume`
 *   (BUG-0509). On a position of 2 with a 0.001 step and a minimum of 0.5, 1 %
 *   resolves to 0.5 — 25 %, not 1 %.
 *
 * Both are the documented rules doing their job, not the ratio drifting, so
 * neither fixture is used here. `LONG` is the plain case: no minimum, a step
 * the position divides by. The 101 cases below are whole percentages of that
 * one fixture, not a proof for arbitrary positions — a claim of that shape
 * belongs with the calculator, not with a labelling change.
 */
describe("FEAT-0573 — percentage and quantity describe the same slice", () => {
    it.each(Array.from({ length: 101 }, (_, p) => p))(
        "round-trips the handle at %s percent through the submitted quantity",
        (p) => {
            const percent = new Decimal(p);
            const qty = quantityFromPercent(LONG, percent);
            expect(percentFromQuantity(LONG, qty).toString()).toBe(percent.toString());
        },
    );

    it("resolves the same percentage against a size that moved under the dialog", () => {
        const bigger = { ...LONG, positionAmount: new Decimal(4) };

        // Half of two is one; half of four is two. The handle did not move,
        // the position did — which is the whole reason the wording has to name
        // the live size rather than the size the dialog opened with.
        expect(quantityFromPercent(LONG, new Decimal(50)).toString()).toBe("1");
        expect(quantityFromPercent(bigger, new Decimal(50)).toString()).toBe("2");
    });

    it("reports a fixed quantity as a smaller share once the size grows", () => {
        const bigger = { ...LONG, positionAmount: new Decimal(4) };
        const qty = new Decimal(1);

        // The percentage is derived from the amount rather than stored beside
        // it, so it cannot claim 50 % of a position that is now twice as large.
        expect(percentFromQuantity(LONG, qty).toString()).toBe("50");
        expect(percentFromQuantity(bigger, qty).toString()).toBe("25");
    });
});

