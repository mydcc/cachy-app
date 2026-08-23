// @vitest-environment node
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
    priceFromChangePercent,
    changePercentFromPrice,
    priceFromRoiPercent,
    roiPercentFromPrice,
    priceFromPnl,
    pnlFromPrice,
    netPnlFromPrice,
    netRoiPercentFromPrice,
    roundToTick,
    type TpSlContext,
    type FeeRates,
} from "./tpsl";

/** Entry 100, 10x, 2 contracts — small round numbers so the arithmetic is checkable by eye. */
const LONG: TpSlContext = {
    entryPrice: new Decimal(100),
    leverage: new Decimal(10),
    side: "LONG",
    positionSize: new Decimal(2),
};

const SHORT: TpSlContext = { ...LONG, side: "SHORT" };

describe("Change mode", () => {
    it("puts a long's take-profit above entry", () => {
        // +5% of 100 = 105.
        expect(priceFromChangePercent(LONG, new Decimal(5)).toString()).toBe("105");
    });

    it("puts a short's take-profit below entry — same positive input, opposite side", () => {
        // A short profits when price falls, so favourable-positive means down.
        expect(priceFromChangePercent(SHORT, new Decimal(5)).toString()).toBe("95");
    });

    it("puts a long's stop below entry on a negative input", () => {
        expect(priceFromChangePercent(LONG, new Decimal(-5)).toString()).toBe("95");
    });

    it("puts a short's stop above entry on a negative input", () => {
        expect(priceFromChangePercent(SHORT, new Decimal(-5)).toString()).toBe("105");
    });

    it("is leverage-independent", () => {
        const at50x: TpSlContext = { ...LONG, leverage: new Decimal(50) };
        expect(priceFromChangePercent(at50x, new Decimal(5)).toString()).toBe(
            priceFromChangePercent(LONG, new Decimal(5)).toString(),
        );
    });

    it("returns zero rather than dividing by a zero entry price", () => {
        const noEntry: TpSlContext = { ...LONG, entryPrice: new Decimal(0) };
        expect(changePercentFromPrice(noEntry, new Decimal(100)).toString()).toBe("0");
    });
});

describe("ROI mode", () => {
    it("multiplies the price move by leverage — 100% ROI at 10x is a 10% move", () => {
        expect(priceFromRoiPercent(LONG, new Decimal(100)).toString()).toBe("110");
    });

    it("moves a short down for a positive ROI", () => {
        expect(priceFromRoiPercent(SHORT, new Decimal(100)).toString()).toBe("90");
    });

    it("reaches liquidation territory at -100% ROI — the whole margin is gone", () => {
        // 10x, so a 10% adverse move wipes the posted margin. This is why the
        // reference UI caps its stop-loss slider below 100%.
        expect(priceFromRoiPercent(LONG, new Decimal(-100)).toString()).toBe("90");
    });

    it("scales inversely with leverage — the same ROI needs a smaller move at higher leverage", () => {
        const at50x: TpSlContext = { ...LONG, leverage: new Decimal(50) };
        // 100% ROI at 50x is a 2% move, not 10%.
        expect(priceFromRoiPercent(at50x, new Decimal(100)).toString()).toBe("102");
    });

    it("does not depend on position size", () => {
        const bigger: TpSlContext = { ...LONG, positionSize: new Decimal(1000) };
        expect(priceFromRoiPercent(bigger, new Decimal(60)).toString()).toBe(
            priceFromRoiPercent(LONG, new Decimal(60)).toString(),
        );
    });

    it("falls back to entry rather than dividing by zero leverage", () => {
        const noLeverage: TpSlContext = { ...LONG, leverage: new Decimal(0) };
        expect(priceFromRoiPercent(noLeverage, new Decimal(100)).toString()).toBe("100");
    });
});

describe("PnL mode", () => {
    it("converts an absolute profit into a price via position size", () => {
        // 2 contracts, want 50 USDT → 25 USDT per contract → 125.
        expect(priceFromPnl(LONG, new Decimal(50)).toString()).toBe("125");
    });

    it("moves a short down for a positive profit", () => {
        expect(priceFromPnl(SHORT, new Decimal(50)).toString()).toBe("75");
    });

    it("scales with position size — the same USDT target needs a smaller move on a bigger position", () => {
        const bigger: TpSlContext = { ...LONG, positionSize: new Decimal(10) };
        expect(priceFromPnl(bigger, new Decimal(50)).toString()).toBe("105");
    });

    it("falls back to entry on a zero-size position instead of returning infinity", () => {
        const empty: TpSlContext = { ...LONG, positionSize: new Decimal(0) };
        expect(priceFromPnl(empty, new Decimal(50)).toString()).toBe("100");
    });
});

describe("round trips", () => {
    // The two directions are written as separate formulas, so this is what
    // stops them drifting apart: the slider sets a price from a percentage and
    // then has to put its own handle back from that price.
    const cases: Array<[string, TpSlContext]> = [
        ["long", LONG],
        ["short", SHORT],
    ];

    for (const [name, ctx] of cases) {
        it(`change → price → change is exact for a ${name}`, () => {
            for (const pct of [150, 30, 0, -30, -75]) {
                const price = priceFromChangePercent(ctx, new Decimal(pct));
                expect(changePercentFromPrice(ctx, price).toString()).toBe(String(pct));
            }
        });

        it(`roi → price → roi is exact for a ${name}`, () => {
            for (const pct of [150, 30, 0, -30, -75]) {
                const price = priceFromRoiPercent(ctx, new Decimal(pct));
                expect(roiPercentFromPrice(ctx, price).toString()).toBe(String(pct));
            }
        });

        it(`pnl → price → pnl is exact for a ${name}`, () => {
            for (const amount of [250, 50, 0, -50, -250]) {
                const price = priceFromPnl(ctx, new Decimal(amount));
                expect(pnlFromPrice(ctx, price).toString()).toBe(String(amount));
            }
        });
    }

    it("agrees across modes — 100% ROI at 10x on 2 contracts is a 10% move worth 20 USDT", () => {
        const fromRoi = priceFromRoiPercent(LONG, new Decimal(100));
        expect(changePercentFromPrice(LONG, fromRoi).toString()).toBe("10");
        expect(pnlFromPrice(LONG, fromRoi).toString()).toBe("20");
    });
});

describe("fees", () => {
    /** Bitunix's published rates: maker 0.014%, taker 0.042%. */
    const MAKER_THEN_TAKER: FeeRates = {
        entryPercent: new Decimal("0.014"),
        exitPercent: new Decimal("0.042"),
    };
    const FREE: FeeRates = { entryPercent: new Decimal(0), exitPercent: new Decimal(0) };

    it("charges each leg on the notional it actually trades at", () => {
        // Entry: 2 × 100 × 0.014% = 0.028. Exit: 2 × 110 × 0.042% = 0.0924.
        // Gross 20 − 0.028 − 0.0924 = 19.8796.
        const net = netPnlFromPrice(LONG, new Decimal(110), MAKER_THEN_TAKER);
        expect(net.toString()).toBe("19.8796");
    });

    it("collapses to gross when both rates are zero", () => {
        const price = new Decimal(110);
        expect(netPnlFromPrice(LONG, price, FREE).toString()).toBe(
            pnlFromPrice(LONG, price).toString(),
        );
    });

    it("makes a loss worse, not better — fees are paid either way", () => {
        const stop = new Decimal(95);
        const gross = pnlFromPrice(LONG, stop);
        const net = netPnlFromPrice(LONG, stop, MAKER_THEN_TAKER);
        expect(gross.toString()).toBe("-10");
        expect(net.lt(gross)).toBe(true);
    });

    it("charges a short's fees on the same notionals as a long's", () => {
        // A short to 90 moves the same 10 points, but its exit notional is
        // 2 × 90, not 2 × 110 — so its exit fee is smaller, not mirrored.
        const net = netPnlFromPrice(SHORT, new Decimal(90), MAKER_THEN_TAKER);
        // Gross 20 − 0.028 − (2 × 90 × 0.042%) = 20 − 0.028 − 0.0756.
        expect(net.toString()).toBe("19.8964");
    });

    it("reports net ROI against the posted margin", () => {
        // Margin = 2 × 100 / 10 = 20. Net 19.8796 / 20 = 99.398%.
        const roi = netRoiPercentFromPrice(LONG, new Decimal(110), MAKER_THEN_TAKER);
        expect(roi.toDecimalPlaces(3).toString()).toBe("99.398");
    });

    it("sits below gross ROI — which is the whole reason it is shown", () => {
        const price = new Decimal(110);
        expect(roiPercentFromPrice(LONG, price).toString()).toBe("100");
        expect(netRoiPercentFromPrice(LONG, price, MAKER_THEN_TAKER).lt(100)).toBe(true);
    });

    it("returns zero for a position with no size rather than dividing by zero", () => {
        const empty: TpSlContext = { ...LONG, positionSize: new Decimal(0) };
        expect(netRoiPercentFromPrice(empty, new Decimal(110), MAKER_THEN_TAKER).toString()).toBe("0");
    });
});

describe("roundToTick", () => {
    it("snaps to the nearest tick", () => {
        expect(roundToTick(new Decimal("100.037"), new Decimal("0.01")).toString()).toBe("100.04");
    });

    it("snaps down when nearer the lower tick", () => {
        expect(roundToTick(new Decimal("100.033"), new Decimal("0.01")).toString()).toBe("100.03");
    });

    it("handles coarse ticks", () => {
        expect(roundToTick(new Decimal("103"), new Decimal("5")).toString()).toBe("105");
    });

    it("does not introduce binary float error", () => {
        // 0.1 + 0.2 territory — the reason decimal.js is mandatory for money.
        expect(roundToTick(new Decimal("0.3"), new Decimal("0.1")).toString()).toBe("0.3");
    });

    it("passes the price through when tick size is unknown", () => {
        expect(roundToTick(new Decimal("100.037"), new Decimal(0)).toString()).toBe("100.037");
    });
});
