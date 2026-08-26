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
import {
    getSourceData,
    zipToLine,
    buildVolumeData,
    type ChartRow,
} from "./seriesMap";

const rows: ChartRow[] = [
    { time: 1000 as ChartRow["time"], open: 10, high: 12, low: 9, close: 11, volume: 100 },
    { time: 2000 as ChartRow["time"], open: 11, high: 15, low: 10, close: 14, volume: 200 },
    { time: 3000 as ChartRow["time"], open: 14, high: 16, low: 13, close: 13, volume: 50 },
];

describe("getSourceData", () => {
    it("resolves each price source from the candle rows", () => {
        expect(Array.from(getSourceData(rows, "close"))).toEqual([11, 14, 13]);
        expect(Array.from(getSourceData(rows, "open"))).toEqual([10, 11, 14]);
        expect(Array.from(getSourceData(rows, "high"))).toEqual([12, 15, 16]);
        expect(Array.from(getSourceData(rows, "low"))).toEqual([9, 10, 13]);
        expect(Array.from(getSourceData(rows, "hl2"))).toEqual([
            (12 + 9) / 2,
            (15 + 10) / 2,
            (16 + 13) / 2,
        ]);
        expect(Array.from(getSourceData(rows, "hlc3"))).toEqual([
            (12 + 9 + 11) / 3,
            (15 + 10 + 14) / 3,
            (16 + 13 + 13) / 3,
        ]);
    });

    it("defaults to close when no source is given", () => {
        expect(Array.from(getSourceData(rows))).toEqual([11, 14, 13]);
    });
});

describe("zipToLine", () => {
    it("zips index-aligned values to candle times and skips non-finite", () => {
        const values = [1, NaN, 3];
        const out = zipToLine(values, rows);
        expect(out).toEqual([
            { time: 1000 as ChartRow["time"], value: 1 },
            { time: 3000 as ChartRow["time"], value: 3 },
        ]);
    });

    it("skips values beyond the row count", () => {
        const values = [1, 2, 3, 4];
        const out = zipToLine(values, rows);
        expect(out).toHaveLength(3);
    });
});

describe("buildVolumeData", () => {
    it("colors up bars (close >= open) with the up color and down bars with the down color", () => {
        const out = buildVolumeData(rows, "UP", "DOWN");
        expect(out[0]).toMatchObject({ time: 1000, value: 100, color: "UP" });
        expect(out[1]).toMatchObject({ time: 2000, value: 200, color: "UP" });
        expect(out[2]).toMatchObject({ time: 3000, value: 50, color: "DOWN" });
    });
});
